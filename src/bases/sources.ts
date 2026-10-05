import { App, Component } from 'obsidian';
import type { BaseReference, BaseResult, BookmarkFolder } from '../types';
import { nativeBaseHandler, queryNativeBase } from './native';

interface CachedSource { result: BaseResult; updated: number }

export class BaseSources extends Component {
	private cache = new Map<string, CachedSource>();
	private stopped = false;
	private available: boolean;
	constructor(private app: App, private changed: () => void,
		private query: (app: App, reference: BaseReference) => Promise<string[]> = queryNativeBase) {
		super(); this.available = Boolean(nativeBaseHandler(app));
	}
	onload(): void { this.stopped = false; }
	onunload(): void { this.stopped = true; this.cache.clear(); }
	invalidate(): void { this.cache.clear(); }

	results(folders: BookmarkFolder[]): Map<string, BaseResult> {
		const results = new Map<string, BaseResult>();
		for (const folder of folders) if (folder.kind === 'dynamic' && folder.source === 'base') {
			results.set(folder.id, this.get(folder.base));
		}
		return results;
	}

	get(reference?: BaseReference): BaseResult {
		if (!reference?.path || !reference.view) return { status: 'error', paths: [], message: 'Select a base file and a named view.' };
		const key = JSON.stringify([reference.path, reference.view]);
		const existing = this.cache.get(key);
		if (existing) return existing.result;
		const entry: CachedSource = { result: { status: 'loading', paths: [], message: 'Loading base view…' }, updated: Date.now() };
		if (this.stopped) return entry.result;
		this.cache.set(key, entry);
		void this.query(this.app, { ...reference }).then((paths) => {
			entry.result = { status: 'ready', paths };
		}, (error: unknown) => {
			entry.result = { status: 'error', paths: [], message: error instanceof Error ? error.message
				: typeof error === 'string' ? error : 'Could not load this base view.' };
		}).then(() => {
			if (!this.stopped && this.cache.get(key) === entry) { entry.updated = Date.now(); this.changed(); }
		});
		return entry.result;
	}

	/** Also refresh date-based filters while an open sidebar has no vault events. */
	poll(): void {
		const available = Boolean(nativeBaseHandler(this.app));
		if (available !== this.available) { this.available = available; this.invalidate(); this.changed(); return; }
		let expired = false;
		for (const [key, entry] of this.cache) if (entry.result.status !== 'loading' && Date.now() - entry.updated > 60000) {
			this.cache.delete(key); expired = true;
		}
		if (expired) this.changed();
	}
}

import { App, Component, Notice } from 'obsidian';
import { record } from '../model/data';
import { parseBookmarks } from './parse';
import type { CoreBookmark } from '../types';

/** Private Bookmarks access; moves use core's own mutation/persistence method. */
export class CoreBookmarks extends Component {
	items: CoreBookmark[] = [];
	status = '';
	private fingerprint = '';
	private refreshing = false;
	private stopped = false;

	constructor(private app: App, private changed: () => void) { super(); }

	onload(): void { this.stopped = false; }
	onunload(): void { this.stopped = true; }

	private instance(): Record<string, unknown> | null {
		const app = this.app as unknown as { internalPlugins?: {
			getEnabledPluginById?: (id: string) => unknown;
			plugins?: Record<string, unknown>;
		} };
		const registry = app.internalPlugins;
		if (typeof registry?.getEnabledPluginById === 'function') {
			const enabled = record(registry.getEnabledPluginById('bookmarks'));
			if (enabled) return enabled;
		}
		const plugin = record(registry?.plugins?.bookmarks);
		return plugin && plugin.enabled !== false ? record(plugin.instance) : null;
	}

	async refresh(): Promise<void> {
		if (this.refreshing || this.stopped) return;
		this.refreshing = true;
		try {
			const instance = this.instance();
			let raw: unknown;
			let status = '';
			if (instance && Array.isArray(instance.items)) raw = instance.items;
			else {
				const path = `${this.app.vault.configDir}/bookmarks.json`;
				if (await this.app.vault.adapter.exists(path)) {
					const saved = record(JSON.parse(await this.app.vault.adapter.read(path)) as unknown);
					if (!saved || !Array.isArray(saved.items)) throw new Error('Unrecognized Bookmarks data.');
					raw = saved.items;
					status = 'Showing saved bookmarks. Enable the Bookmarks core plugin for live changes.';
				} else {
					raw = [];
					status = 'Enable the Bookmarks core plugin to add built-in bookmarks.';
				}
			}
			const fingerprint = JSON.stringify(raw) + status;
			if (!this.stopped && (fingerprint !== this.fingerprint || this.status !== status)) {
				this.fingerprint = fingerprint;
				this.items = parseBookmarks(raw);
				this.status = status;
				this.changed();
			}
		} catch {
			if (!this.stopped && this.status !== 'Could not read built-in bookmarks. Your last loaded bookmarks are still shown.') {
				this.status = 'Could not read built-in bookmarks. Your last loaded bookmarks are still shown.';
				this.changed();
			}
		} finally { this.refreshing = false; }
	}

	async open(item: CoreBookmark, newTab: boolean): Promise<void> {
		try {
			if (item.type === 'file') {
				const file = this.app.vault.getFileByPath(item.path);
				if (!file) throw new Error('Missing bookmarked file.');
				await this.app.workspace.getLeaf(newTab ? 'tab' : false).openFile(file, { eState: { subpath: item.subpath } });
			} else if (item.type === 'search') {
				const leaf = this.app.workspace.getLeavesOfType('search')[0] ?? this.app.workspace.getLeftLeaf(false);
				if (!leaf) throw new Error('Search pane unavailable.');
				await leaf.setViewState({ type: 'search', active: true, state: { query: item.query } });
				await this.app.workspace.revealLeaf(leaf);
			} else if (item.type === 'graph') {
				// Let Bookmarks preserve all graph options instead of guessing its private view state.
				const instance = this.instance();
				if (!instance || typeof instance.openBookmark !== 'function') throw new Error('Core Bookmarks opener unavailable.');
				const open = instance.openBookmark as (bookmark: Record<string, unknown>, type: boolean | 'tab') => Promise<void>;
				await open.call(instance, item.original, newTab ? 'tab' : false);
			} else if (item.type === 'url') {
				const url = new URL(item.url);
				if (!['https:', 'http:', 'obsidian:'].includes(url.protocol)) throw new Error('Unsupported link protocol.');
				window.open(url.href, '_blank', 'noopener,noreferrer');
			} else new Notice(`Open this ${item.type} bookmark in the built-in Bookmarks pane.`);
		} catch { new Notice('Could not open this bookmark. Check its target and whether the required core plugin is enabled.'); }
	}

	canMove(): boolean { return typeof this.instance()?.moveItem === 'function'; }

	menuTarget(id: string): { plugin: Record<string, unknown>; bookmark: CoreBookmark } | null {
		const plugin = this.instance();
		if (!plugin || !Array.isArray(plugin.items)) return null;
		const find = (items: CoreBookmark[]): CoreBookmark | undefined => {
			for (const item of items) { if (item.id === id) return item; const child = find(item.items); if (child) return child; }
			return undefined;
		};
		const bookmark = find(parseBookmarks(plugin.items));
		return bookmark ? { plugin, bookmark } : null;
	}

	async rename(original: Record<string, unknown>, title: string): Promise<boolean> {
		const plugin = this.instance();
		const contains = (items: CoreBookmark[]): boolean => items.some((item) => item.original === original || contains(item.items));
		if (!title.trim() || !plugin || typeof plugin.onItemsChanged !== 'function' || !contains(parseBookmarks(plugin.items))) {
			new Notice('This bookmark is unavailable. Enable core bookmarks and refresh.'); return false;
		}
		const previous = original.title;
		try {
			original.title = title.trim();
			(plugin.onItemsChanged as (save: boolean) => void).call(plugin, true);
			await this.refresh(); return true;
		} catch { original.title = previous; new Notice('Could not rename this bookmark.'); return false; }
	}

	private currentTabCommand(): { manager: Record<string, unknown>; command: Record<string, unknown> } | null {
		if (!this.instance()) return null;
		const runtime = this.app as unknown as { commands?: unknown };
		const manager = record(runtime.commands);
		const command = record(record(manager?.commands)?.['bookmarks:bookmark-current-view']);
		return manager && typeof manager.executeCommandById === 'function' && typeof command?.checkCallback === 'function'
			? { manager, command } : null;
	}

	canBookmarkCurrentTab(): boolean {
		const native = this.currentTabCommand();
		if (!native) return false;
		try { return Boolean((native.command.checkCallback as (checking: boolean) => boolean).call(native.command, true)); }
		catch { return false; }
	}

	bookmarkCurrentTab(): boolean {
		if (!this.instance()) { new Notice('Enable core bookmarks to bookmark the current tab.'); return false; }
		const native = this.currentTabCommand();
		if (!native) { new Notice('The native bookmark command is unavailable. Try updating Obsidian.'); return false; }
		if (!this.canBookmarkCurrentTab()) { new Notice('The current tab cannot be bookmarked. Select a supported tab first.'); return false; }
		try {
			const execute = native.manager.executeCommandById as (id: string) => boolean;
			if (!execute.call(native.manager, 'bookmarks:bookmark-current-view')) throw new Error('Bookmark command failed.');
			return true;
		} catch { new Notice('Could not open the bookmark dialog.'); return false; }
	}

	async move(id: string, parentId: string | null, beforeId: string | null): Promise<boolean> {
		const instance = this.instance();
		if (!instance || typeof instance.moveItem !== 'function' || !Array.isArray(instance.items)) {
			new Notice('Enable core bookmarks to reorder built-in bookmarks.'); return false;
		}
		const items = parseBookmarks(instance.items);
		const find = (entries: CoreBookmark[], key: string): CoreBookmark | undefined => {
			for (const item of entries) { if (item.id === key) return item; const nested = find(item.items, key); if (nested) return nested; }
			return undefined;
		};
		const source = find(items, id), parent = parentId ? find(items, parentId) : undefined;
		if (!source || (parentId && parent?.type !== 'group') || parent?.id === id || (parentId && find(source.items, parentId))) return false;
		const siblings = parent?.items ?? items;
		const index = beforeId ? siblings.findIndex((item) => item.id === beforeId) : siblings.length;
		if (index < 0) return false;
		try {
			const move = instance.moveItem as (item: Record<string, unknown>, parent: Record<string, unknown> | null, index: number) => void;
			move.call(instance, source.original, parent?.original ?? null, index);
			await this.refresh(); return true;
		} catch { new Notice('Could not move this bookmark. Try refreshing bookmarks.'); return false; }
	}
}

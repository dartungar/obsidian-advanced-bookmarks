import { App, Component, Notice, TAbstractFile } from 'obsidian';
import type AdvancedBookmarksPlugin from '../main';
import type { BookmarkData, BookmarkFolder, FolderChoice } from '../types';
import { descendantIds, updateNotePaths } from '../model/data';
import { coreGroups } from '../bookmarks/parse';
import { CoreBookmarks } from '../bookmarks/core';
import { NoteIndex } from './notes';
import { BaseSources } from '../bases/sources';

export class BookmarkController extends Component {
	readonly core: CoreBookmarks;
	readonly notes: NoteIndex;
	readonly bases: BaseSources;
	private listeners = new Set<() => void>();
	private timer: number | null = null;
	private pendingSave: Promise<void> = Promise.resolve();

	constructor(readonly app: App, readonly data: BookmarkData, private plugin: AdvancedBookmarksPlugin) {
		super();
		this.core = this.addChild(new CoreBookmarks(app, () => this.emit()));
		this.notes = new NoteIndex(app);
		this.bases = this.addChild(new BaseSources(app, () => this.emit()));
	}

	onload(): void {
		const update = () => { this.notes.invalidate(); this.bases.invalidate(); this.schedule(); };
		this.registerEvent(this.app.metadataCache.on('changed', update));
		this.registerEvent(this.app.metadataCache.on('resolved', update));
		this.registerEvent(this.app.vault.on('create', update));
		this.registerEvent(this.app.vault.on('modify', update));
		this.registerEvent(this.app.vault.on('delete', update));
		this.registerEvent(this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
			if (updateNotePaths(this.data, oldPath, file.path)) void this.save();
			update();
		}));
		// Core Bookmarks exposes no public change event. Poll only while a view is open.
		this.plugin.registerInterval(window.setInterval(() => {
			if (this.listeners.size) { void this.core.refresh(); this.bases.poll(); }
		}, 2000));
	}

	onunload(): void {
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.listeners.clear();
	}

	subscribe(callback: () => void): () => void {
		this.listeners.add(callback);
		return () => { this.listeners.delete(callback); };
	}

	emit(): void { for (const listener of this.listeners) listener(); }

	private schedule(): void {
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => { this.timer = null; this.emit(); }, 250);
	}

	async save(): Promise<boolean> {
		const snapshot: BookmarkData = JSON.parse(JSON.stringify(this.data)) as BookmarkData;
		const write = this.pendingSave.then(() => this.plugin.saveData(snapshot));
		// Keep writes ordered; a failed write must not poison subsequent saves.
		this.pendingSave = write.catch(() => {});
		try { await write; this.emit(); return true; }
		catch { new Notice('Could not save bookmark settings. Check vault storage and try again.'); return false; }
	}

	async saveFolder(folder: BookmarkFolder): Promise<boolean> {
		const descendants = descendantIds(this.data.folders, folder.id);
		if (folder.parentId && (descendants.has(folder.parentId) || !this.choices().some((choice) => choice.id === folder.parentId))) {
			new Notice('Select an existing parent outside this folder.'); return false;
		}
		const existing = this.data.folders.findIndex((item) => item.id === folder.id);
		if (existing < 0) this.data.folders.push(folder);
		else this.data.folders[existing] = folder;
		return this.save();
	}

	async deleteFolder(id: string): Promise<void> {
		const ids = descendantIds(this.data.folders, id);
		this.data.folders = this.data.folders.filter((folder) => !ids.has(folder.id));
		for (const child of ids) delete this.data.folderNotes[child];
		for (const [parent, order] of Object.entries(this.data.itemOrder)) {
			if (ids.has(parent)) delete this.data.itemOrder[parent];
			else this.data.itemOrder[parent] = order.filter((child) => !ids.has(child));
		}
		this.data.collapsed = this.data.collapsed.filter((child) => !ids.has(child));
		await this.save();
	}

	choices(exclude?: string): FolderChoice[] {
		const excluded = exclude ? descendantIds(this.data.folders, exclude) : new Set<string>();
		const core = coreGroups(this.core.items);
		const names = new Map(core.map((item) => [item.id, item.name]));
		const name = (folder: BookmarkFolder, seen = new Set<string>()): string => {
			if (!folder.parentId || seen.has(folder.id)) return folder.name;
			seen.add(folder.id);
			const parent = this.data.folders.find((item) => item.id === folder.parentId);
			const prefix = parent ? name(parent, seen) : names.get(folder.parentId);
			return prefix ? `${prefix} / ${folder.name}` : folder.name;
		};
		return [...core, ...this.data.folders.filter((folder) => !excluded.has(folder.id)).map((folder) => ({ id: folder.id, name: name(folder) }))];
	}
}

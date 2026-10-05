import { App, getAllTags } from 'obsidian';
import type { NoteDescriptor } from '../types';

/** Cache metadata, never note bodies; refresh lazily only when a sidebar needs it. */
export class NoteIndex {
	private cache: NoteDescriptor[] | null = null;
	constructor(private app: App) {}
	invalidate(): void { this.cache = null; }
	get(): NoteDescriptor[] {
		if (!this.cache) this.cache = this.app.vault.getMarkdownFiles().map((file) => {
			const metadata = this.app.metadataCache.getFileCache(file);
			return { path: file.path, name: file.basename, mtime: file.stat.mtime, ctime: file.stat.ctime,
				tags: metadata ? getAllTags(metadata) ?? [] : [],
				properties: metadata?.frontmatter ?? {} };
		});
		return this.cache;
	}
}

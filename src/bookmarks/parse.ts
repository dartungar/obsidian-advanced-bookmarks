import type { CoreBookmark } from '../types';
import { record } from '../model/data';

export function parseBookmarks(raw: unknown, ancestors = '', depth = 0): CoreBookmark[] {
	if (!Array.isArray(raw) || depth > 100) return [];
	const ids = new Map<string, number>();
	const bookmarks: CoreBookmark[] = [];
	for (const [index, entry] of (raw as unknown[]).entries()) {
		const item = record(entry);
		if (!item || typeof item.type !== 'string') continue;
		const string = (key: string) => typeof item[key] === 'string' ? item[key] : '';
		const title = string('title') || string('path') || string('query') || string('url') || item.type;
		const base = typeof item.ctime === 'number' ? `core:${item.type}:${item.ctime}`
			: `core:${ancestors}/${encodeURIComponent(title)}:${index}`;
		const count = ids.get(base) ?? 0;
		ids.set(base, count + 1);
		const id = count ? `${base}:${count}` : base;
		bookmarks.push({ id, type: item.type, title, path: string('path'), subpath: string('subpath'),
			query: string('query'), url: string('url'), items: parseBookmarks(item.items, id, depth + 1), original: item });
	}
	return bookmarks;
}

export function coreGroups(bookmarks: CoreBookmark[], prefix = ''): { id: string; name: string }[] {
	return bookmarks.flatMap((item) => {
		if (item.type !== 'group') return [];
		const name = prefix ? `${prefix} / ${item.title}` : item.title;
		return [{ id: item.id, name }, ...coreGroups(item.items, name)];
	});
}

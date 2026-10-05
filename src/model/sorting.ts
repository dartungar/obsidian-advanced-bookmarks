import type { BookmarkFolder, NoteDescriptor } from '../types';

export const SORT_FIELDS = { manual: 'Manual', title: 'Title', name: 'Filename', path: 'File path', created: 'Date created', modified: 'Date modified', base: 'Base view order' };

export function noteTitle(note: NoteDescriptor): string {
	const value = note.properties.title;
	return typeof value === 'string' && value.trim() ? value.trim() : note.name;
}

export function sortDirection(folder: BookmarkFolder): 'asc' | 'desc' {
	return folder.sortDirection ?? (folder.sort === 'modified' ? 'desc' : 'asc');
}

export function sortNotes(notes: NoteDescriptor[], folder: BookmarkFolder): NoteDescriptor[] {
	if (folder.sort === 'manual') {
		const rank = new Map((folder.manualOrder ?? []).map((path, index) => [path, index]));
		return [...notes].sort((a, b) => (rank.get(a.path) ?? Infinity) - (rank.get(b.path) ?? Infinity)
			|| noteTitle(a).localeCompare(noteTitle(b), undefined, { numeric: true, sensitivity: 'base' }) || a.path.localeCompare(b.path));
	}
	if (folder.sort === 'base') return sortDirection(folder) === 'desc' ? [...notes].reverse() : [...notes];
	const sign = sortDirection(folder) === 'desc' ? -1 : 1;
	const text = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
	return [...notes].sort((a, b) => {
		let comparison = 0;
		switch (folder.sort) {
			case 'created': comparison = a.ctime - b.ctime; break;
			case 'modified': comparison = a.mtime - b.mtime; break;
			case 'path': comparison = text(a.path, b.path); break;
			case 'title': comparison = text(noteTitle(a), noteTitle(b)); break;
			case 'name': comparison = text(a.name, b.name); break;
		}
		return sign * comparison || a.path.localeCompare(b.path);
	});
}

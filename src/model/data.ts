import type { BookmarkData, BookmarkFolder, Rule } from '../types';
import { SORT_FIELDS } from './sorting';

export function record(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function defaultData(): BookmarkData {
	return { version: 1, folders: [], folderNotes: {}, collapsed: [], itemOrder: {}, settings: { showCounts: true, showFileIcons: true, folderNoteDirectory: 'Bookmark notes' } };
}

export function parseRule(raw: unknown): Rule | null {
	const value = record(raw);
	if (!value || !['tag', 'folder', 'name', 'property'].includes(String(value.field))
		|| !['is', 'contains', 'exists'].includes(String(value.operator))) return null;
	if (typeof value.value !== 'string' || typeof value.property !== 'string') return null;
	return { field: value.field as Rule['field'], operator: value.operator as Rule['operator'],
		value: value.value, property: value.property, negate: value.negate === true };
}

export function loadBookmarkData(raw: unknown): BookmarkData {
	const data = defaultData();
	const value = record(raw);
	if (!value) return data;
	if (value.version !== undefined && value.version !== 1) throw new Error('Unsupported Advanced Bookmarks data version.');
	const ids = new Set<string>();
	if (Array.isArray(value.folders)) for (const entry of value.folders as unknown[]) {
		const folder = record(entry);
		if (!folder || typeof folder.id !== 'string' || !folder.id.startsWith('custom:') || ids.has(folder.id)
			|| typeof folder.name !== 'string' || !folder.name.trim() || !['dynamic', 'group'].includes(String(folder.kind))) continue;
		const rules: Rule[] = [];
		if (Array.isArray(folder.rules)) for (const rawRule of folder.rules as unknown[]) {
			const rule = parseRule(rawRule);
			// Preserve an invalid query as a rule that fails validation; never broaden it.
			rules.push(rule ?? { field: 'name', operator: 'is', value: '', property: '', negate: false });
		}
		ids.add(folder.id);
		const base = record(folder.base);
		data.folders.push({ id: folder.id, name: folder.name.trim(), kind: folder.kind as BookmarkFolder['kind'],
			parentId: typeof folder.parentId === 'string' ? folder.parentId : null,
			match: folder.match === 'any' ? 'any' : 'all', rules,
			source: folder.source === 'base' ? 'base' : 'rules',
			base: base ? { path: typeof base.path === 'string' ? base.path : '', view: typeof base.view === 'string' ? base.view : '' } : undefined,
			sort: Object.prototype.hasOwnProperty.call(SORT_FIELDS, String(folder.sort)) ? folder.sort as BookmarkFolder['sort'] : 'name',
			manualOrder: Array.isArray(folder.manualOrder) ? [...new Set(folder.manualOrder.filter((path): path is string => typeof path === 'string'))] : [],
			sortDirection: folder.sortDirection === 'asc' || folder.sortDirection === 'desc' ? folder.sortDirection
				: folder.sort === 'modified' ? 'desc' : 'asc' });
	}
	// Detach broken links and cycles while preserving the folders themselves.
	for (const folder of data.folders) {
		if (folder.parentId?.startsWith('custom:') && !ids.has(folder.parentId)) folder.parentId = null;
		if (descendantIds(data.folders, folder.id).has(folder.parentId ?? '')) folder.parentId = null;
	}
	const notes = record(value.folderNotes);
	if (notes) for (const [id, path] of Object.entries(notes)) {
		if (typeof path === 'string' && path) data.folderNotes[id] = path;
	}
	if (Array.isArray(value.collapsed)) data.collapsed = value.collapsed.filter((id): id is string => typeof id === 'string');
	const order = record(value.itemOrder);
	if (order) for (const [id, entries] of Object.entries(order)) if ((id === 'root' || id.startsWith('core:') || id.startsWith('custom:')) && Array.isArray(entries)) {
		data.itemOrder[id] = [...new Set(entries.filter((entry): entry is string => typeof entry === 'string'))];
	}
	const settings = record(value.settings);
	if (settings) {
		data.settings.showCounts = settings.showCounts !== false;
		data.settings.showFileIcons = settings.showFileIcons !== false;
		if (typeof settings.folderNoteDirectory === 'string') data.settings.folderNoteDirectory = settings.folderNoteDirectory;
	}
	return data;
}

export function descendantIds(folders: BookmarkFolder[], id: string): Set<string> {
	const ids = new Set([id]);
	let changed = true;
	while (changed) {
		changed = false;
		for (const folder of folders) if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
			ids.add(folder.id);
			changed = true;
		}
	}
	return ids;
}

export function updateNotePaths(data: BookmarkData, oldPath: string, newPath: string): boolean {
	let changed = false;
	for (const [id, path] of Object.entries(data.folderNotes)) if (path === oldPath || path.startsWith(`${oldPath}/`)) {
		data.folderNotes[id] = newPath + path.slice(oldPath.length);
		changed = true;
	}
	for (const folder of data.folders) {
		folder.manualOrder = folder.manualOrder?.map((path) => {
			if (path !== oldPath && !path.startsWith(`${oldPath}/`)) return path;
			changed = true; return newPath + path.slice(oldPath.length);
		});
		if (folder.base && (folder.base.path === oldPath || folder.base.path.startsWith(`${oldPath}/`))) {
			folder.base.path = newPath + folder.base.path.slice(oldPath.length);
			changed = true;
		}
		for (const rule of folder.rules) {
			const path = rule.value.replace(/^\/+|\/+$/g, '');
			if (rule.field === 'folder' && (path === oldPath || path.startsWith(`${oldPath}/`))) {
				rule.value = newPath + path.slice(oldPath.length);
				changed = true;
			}
		}
	}
	return changed;
}

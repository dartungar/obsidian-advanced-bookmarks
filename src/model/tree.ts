import type { BaseResult, BookmarkFolder, CoreBookmark, NoteDescriptor } from '../types';
import { selectNotes } from './rules';
import { noteTitle } from './sorting';
import { orderKey, orderSiblings } from './order';

export type TreeNode =
	| { type: 'core'; id: string; name: string; bookmark: CoreBookmark; children: TreeNode[] }
	| { type: 'folder'; id: string; name: string; folder: BookmarkFolder; children: TreeNode[]; count: number; orphan: boolean; message?: string }
	| { type: 'note'; id: string; name: string; path: string; children: TreeNode[] };

export function buildTree(core: CoreBookmark[], folders: BookmarkFolder[], notes: NoteDescriptor[], folderNotes: Record<string, string>, bases: ReadonlyMap<string, BaseResult> = new Map(), itemOrder: Record<string, string[]> = {}): TreeNode[] {
	const validParents = new Set<string>();
	const gather = (items: CoreBookmark[]) => {
		for (const item of items) if (item.type === 'group') { validParents.add(item.id); gather(item.items); }
	};
	gather(core);
	for (const folder of folders) validParents.add(folder.id);
	const visited = new Set<string>();
	const children = (parentId: string | null, candidates: NoteDescriptor[]): TreeNode[] => folders
		.filter((folder) => folder.parentId === parentId || (parentId === null && folder.parentId && !validParents.has(folder.parentId)))
		.flatMap((folder): TreeNode[] => {
			if (visited.has(folder.id)) return [];
			visited.add(folder.id);
			const base = bases.get(folder.id);
			const matches = folder.kind === 'group' ? candidates : selectNotes(candidates, folder, base);
			const nested = orderSiblings(children(folder.id, matches), itemOrder[folder.id]);
			const results: TreeNode[] = folder.kind === 'dynamic' ? matches.filter((note) => note.path !== folderNotes[folder.id])
				.map((note) => ({ type: 'note', id: `${folder.id}:${note.path}`, name: noteTitle(note), path: note.path, children: [] })) : [];
			return [{ type: 'folder', id: folder.id, name: folder.name, folder, children: [...nested, ...results],
				count: results.length, orphan: Boolean(folder.parentId && !validParents.has(folder.parentId)),
				message: folder.source === 'base' && base?.status !== 'ready' ? base?.message ?? 'Loading base view…' : undefined }];
		});
	const builtIn = (items: CoreBookmark[]): TreeNode[] => items.map((bookmark) => {
		const path = bookmark.path.replace(/\/+$/g, '');
		const folderContents: TreeNode[] = bookmark.type === 'folder' ? notes
			.filter((note) => !path || path === '/' || note.path.startsWith(`${path}/`))
			.sort((a, b) => a.path.localeCompare(b.path))
			.map((note) => ({ type: 'note', id: `${bookmark.id}:${note.path}`, name: note.name, path: note.path, children: [] })) : [];
		return { type: 'core', id: bookmark.id, name: bookmark.title, bookmark,
			children: bookmark.type === 'group' ? orderSiblings([...builtIn(bookmark.items), ...children(bookmark.id, notes)], itemOrder[bookmark.id]) : folderContents };
	});
	return orderSiblings([...builtIn(core), ...children(null, notes)], itemOrder[orderKey(null)]);
}

export function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
	const value = query.trim().toLocaleLowerCase();
	if (!value) return nodes;
	return nodes.flatMap((node): TreeNode[] => {
		const path = node.type === 'note' ? node.path : node.type === 'core' ? node.bookmark.path : '';
		if (`${node.name} ${path}`.toLocaleLowerCase().includes(value)) return [node];
		const children = filterTree(node.children, value);
		return children.length ? [{ ...node, children }] : [];
	});
}

import type { TreeNode } from './tree';

export type DropPosition = 'before' | 'after' | 'inside';
export const orderKey = (parentId: string | null): string => parentId ?? 'root';

/** Custom items retain their slots; native bookmarks always follow core's current order. */
export function orderSiblings(nodes: TreeNode[], saved: string[] = []): TreeNode[] {
	const byId = new Map(nodes.map((node) => [node.id, node]));
	const ordered = [...new Set([...saved, ...nodes.map((node) => node.id)])].flatMap((id) => {
		const node = byId.get(id); return node ? [node] : [];
	});
	const core = nodes.filter((node) => node.type === 'core');
	let index = 0;
	return ordered.map((node) => node.type === 'core' ? core[index++]! : node);
}

interface Located { node: TreeNode; parent: TreeNode | null; siblings: TreeNode[] }
export function locateNode(nodes: TreeNode[], id: string, parent: TreeNode | null = null): Located | null {
	for (const node of nodes) {
		if (node.id === id) return { node, parent, siblings: nodes };
		const found = locateNode(node.children, id, node); if (found) return found;
	}
	return null;
}

export type MovePlan =
	| { type: 'manual'; folderId: string; paths: string[] }
	| { type: 'static'; source: TreeNode; oldParentId: string | null; parentId: string | null; ids: string[]; beforeCoreId: string | null };

export function isContainer(node: TreeNode): boolean {
	return node.type === 'folder' || (node.type === 'core' && node.bookmark.type === 'group');
}

export function isDraggable(node: TreeNode, parent: TreeNode | null): boolean {
	return node.type !== 'note' || (parent?.type === 'folder' && parent.folder.kind === 'dynamic' && parent.folder.sort === 'manual');
}

export function planMove(tree: TreeNode[], sourceId: string, targetId: string, position: DropPosition): MovePlan | null {
	if (sourceId === targetId) return null;
	const source = locateNode(tree, sourceId), target = locateNode(tree, targetId);
	if (!source || !target || !isDraggable(source.node, source.parent)) return null;
	if (source.node.type === 'note') {
		if (position === 'inside' || target.node.type !== 'note' || source.parent !== target.parent || source.parent?.type !== 'folder') return null;
		const notes = source.siblings.filter((node): node is Extract<TreeNode, { type: 'note' }> => node.type === 'note' && node.id !== sourceId);
		const index = notes.findIndex((node) => node.id === targetId) + (position === 'after' ? 1 : 0);
		notes.splice(index, 0, source.node);
		return { type: 'manual', folderId: source.parent.id, paths: notes.map((node) => node.path) };
	}
	if (target.node.type === 'note' || locateNode(source.node.children, targetId)) return null;
	const parent = position === 'inside' ? target.node : target.parent;
	if (parent && !isContainer(parent)) return null;
	if (source.node.type === 'core' && parent && (parent.type !== 'core' || parent.bookmark.type !== 'group')) return null;
	const siblings = (position === 'inside' ? target.node.children : target.siblings).filter((node) => node.type !== 'note' && node.id !== sourceId);
	const index = position === 'inside' ? siblings.length : siblings.findIndex((node) => node.id === targetId) + (position === 'after' ? 1 : 0);
	siblings.splice(index, 0, source.node);
	return { type: 'static', source: source.node, oldParentId: source.parent?.id ?? null, parentId: parent?.id ?? null,
		ids: siblings.map((node) => node.id), beforeCoreId: siblings.slice(index + 1).find((node) => node.type === 'core')?.id ?? null };
}

/** Keep unmatched notes in the saved order so a returning match regains its slot. */
export function mergeManualOrder(saved: string[], paths: string[]): string[] {
	const visible = new Set(paths);
	const order = [...new Set([...saved, ...paths])];
	let index = 0;
	return order.map((path) => visible.has(path) ? paths[index++]! : path);
}

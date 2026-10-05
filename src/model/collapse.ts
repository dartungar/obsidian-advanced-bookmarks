import type { TreeNode } from './tree';

export function collapsibleIds(nodes: TreeNode[]): string[] {
	return nodes.flatMap((node) => node.type === 'folder' || (node.type === 'core' && ['group', 'folder'].includes(node.bookmark.type))
		? [node.id, ...collapsibleIds(node.children)] : []);
}

export function setCollapsedIds(nodes: TreeNode[], previous: Iterable<string>, collapsed: boolean): string[] {
	const ids = new Set(collapsibleIds(nodes));
	return collapsed ? [...new Set([...previous, ...ids])] : [...previous].filter((id) => !ids.has(id));
}

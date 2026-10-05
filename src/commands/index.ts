import type AdvancedBookmarksPlugin from '../main';
import { FolderModal } from '../ui/folder-modal';
import { AdvancedBookmarksView, VIEW_TYPE } from '../ui/view';

export async function openBookmarks(plugin: AdvancedBookmarksPlugin): Promise<void> {
	let leaf = plugin.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
	if (!leaf) {
		leaf = plugin.app.workspace.getLeftLeaf(false) ?? undefined;
		if (!leaf) return;
		await leaf.setViewState({ type: VIEW_TYPE, active: true });
	}
	await plugin.app.workspace.revealLeaf(leaf);
}

export function registerCommands(plugin: AdvancedBookmarksPlugin): void {
	plugin.addRibbonIcon('bookmark-check', 'Open advanced bookmarks', () => { void openBookmarks(plugin); });
	plugin.addCommand({ id: 'open-advanced-bookmarks', name: 'Open bookmarks', callback: () => openBookmarks(plugin) });
	plugin.addCommand({ id: 'bookmark-current-tab', name: 'Bookmark current tab', checkCallback: (checking) => checking
		? plugin.controller.core.canBookmarkCurrentTab() : plugin.controller.core.bookmarkCurrentTab() });
	for (const collapsed of [true, false]) plugin.addCommand({
		id: collapsed ? 'collapse-all-bookmark-folders' : 'expand-all-bookmark-folders',
		name: collapsed ? 'Collapse all folders' : 'Expand all folders',
		callback: async () => {
			await openBookmarks(plugin);
			const view = plugin.app.workspace.getLeavesOfType(VIEW_TYPE)[0]?.view;
			if (view instanceof AdvancedBookmarksView) await view.setAllCollapsed(collapsed);
		},
	});
	plugin.addCommand({ id: 'create-dynamic-folder', name: 'Create dynamic folder', callback: async () => {
		await plugin.controller.core.refresh(); new FolderModal(plugin.controller).open();
	} });
	plugin.addCommand({ id: 'create-bookmark-folder', name: 'Create bookmark folder', callback: async () => {
		await plugin.controller.core.refresh(); new FolderModal(plugin.controller, undefined, null, 'group').open();
	} });
	plugin.addCommand({ id: 'refresh-bookmarks', name: 'Refresh bookmarks', callback: async () => {
		plugin.controller.notes.invalidate(); plugin.controller.bases.invalidate(); await plugin.controller.core.refresh(); plugin.controller.emit();
	} });
}

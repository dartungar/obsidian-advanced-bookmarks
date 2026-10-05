import { Menu } from 'obsidian';
import type { BookmarkController } from '../services/controller';
import { FolderNotes } from '../services/folder-notes';
import type { TreeNode } from '../model/tree';
import { FolderModal } from './folder-modal';
import { ConfirmModal } from './confirm-modal';

export function showFolderMenu(controller: BookmarkController, node: TreeNode, event: MouseEvent): void {
	const menu = new Menu();
	addFolderMenu(menu, controller, node);
	menu.showAtMouseEvent(event);
}

export function addFolderMenu(menu: Menu, controller: BookmarkController, node: TreeNode): void {
	const notes = new FolderNotes(controller);
	menu.addItem((item) => item.setTitle('New dynamic folder').setIcon('folder-plus')
		.onClick(() => new FolderModal(controller, undefined, node.id).open()));
	menu.addItem((item) => item.setTitle('New bookmark folder').setIcon('folder')
		.onClick(() => new FolderModal(controller, undefined, node.id, 'group').open()));
	menu.addSeparator();
	if (controller.data.folderNotes[node.id]) {
		menu.addItem((item) => item.setTitle('Open folder note').setIcon('file-text').onClick(() => notes.open(node.id)));
		menu.addItem((item) => item.setTitle('Unlink folder note').setIcon('unlink').onClick(() => notes.unlink(node.id)));
	} else menu.addItem((item) => item.setTitle('Create folder note').setIcon('file-plus').onClick(() => notes.create(node.id, node.name)));
	menu.addItem((item) => item.setTitle('Link existing folder note').setIcon('link').onClick(() => notes.link(node.id)));
	if (node.type === 'folder') {
		menu.addSeparator();
		menu.addItem((item) => item.setTitle('Edit folder').setIcon('pencil').onClick(() => new FolderModal(controller, node.folder).open()));
		menu.addItem((item) => item.setTitle('Delete folder').setIcon('trash-2')
			.onClick(() => new ConfirmModal(controller.app, node.name, () => controller.deleteFolder(node.id)).open()));
	}
}

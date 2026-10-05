import { Component, Menu, Notice, Platform, WorkspaceLeaf } from 'obsidian';
import { CoreBookmarkMenus } from '../bookmarks/menu';
import { record } from '../model/data';
import type { TreeNode } from '../model/tree';
import type { BookmarkController } from '../services/controller';
import { addFolderMenu } from './folder-menu';

export class TreeMenu extends Component {
	private native: CoreBookmarkMenus;
	constructor(private controller: BookmarkController, private leaf: WorkspaceLeaf) {
		super(); this.native = this.addChild(new CoreBookmarkMenus(controller.app, controller.core));
	}
	show(node: TreeNode, row: HTMLElement, event: MouseEvent): void {
		event.preventDefault(); event.stopPropagation();
		const folder = node.type === 'folder' || (node.type === 'core' && node.bookmark.type === 'group');
		if (node.type === 'core' && this.native.show(node.id, row, this.leaf, event, folder
			? (menu) => { menu.addSeparator(); addFolderMenu(menu, this.controller, node); } : undefined)) return;
		const menu = new Menu();
		if (node.type === 'note') this.noteActions(menu, node.path);
		else if (node.type === 'core') {
			if (!['group', 'folder'].includes(node.bookmark.type)) menu.addItem((item) => item.setTitle('Open in new tab').setIcon('file-plus')
				.onClick(() => this.controller.core.open(node.bookmark, true)));
			const message = this.controller.core.menuTarget(node.id) ? 'Native bookmark actions are unavailable' : 'Enable core bookmarks for bookmark actions';
			menu.addItem((item) => item.setTitle(message).setDisabled(true));
		}
		if (folder) addFolderMenu(menu, this.controller, node);
		menu.showAtMouseEvent(event);
	}
	private noteActions(menu: Menu, path: string): void {
		const { app } = this.controller;
		const file = app.vault.getFileByPath(path);
		if (!file) { menu.addItem((item) => item.setTitle('This note no longer exists').setDisabled(true)); return; }
		for (const [type, label, icon] of [
			['tab', 'Open in new tab', 'file-plus'],
			...(!Platform.isMobile ? [['split', 'Open to the right', 'separator-vertical'], ['window', 'Open in new window', 'picture-in-picture-2']] : []),
		] as ['tab' | 'split' | 'window', string, string][]) menu.addItem((item) => item.setTitle(label).setIcon(icon).onClick(async () => {
			try { await app.workspace.getLeaf(type).openFile(file); } catch { new Notice('Could not open this note.'); }
		}));
		menu.addSeparator();
		const registry = (app as unknown as { internalPlugins?: { getEnabledPluginById?: (id: string) => unknown } }).internalPlugins;
		const explorer = record(registry?.getEnabledPluginById?.('file-explorer'));
		if (typeof explorer?.revealInFolder === 'function') menu.addItem((item) => item.setTitle('Reveal file in navigation').setIcon('folder-open').onClick(() => {
			try { (explorer.revealInFolder as (file: unknown) => void).call(explorer, file); }
			catch { new Notice('Could not reveal this note in file navigation.'); }
		}));
		app.workspace.trigger('file-menu', menu, file, 'advanced-bookmarks');
	}
}

import { Plugin } from 'obsidian';
import { loadBookmarkData } from './model/data';
import { BookmarkController } from './services/controller';
import { AdvancedBookmarksSettingTab } from './settings';
import { AdvancedBookmarksView, VIEW_TYPE } from './ui/view';
import { registerCommands } from './commands';

export default class AdvancedBookmarksPlugin extends Plugin {
	controller!: BookmarkController;
	async onload(): Promise<void> {
		this.controller = this.addChild(new BookmarkController(this.app, loadBookmarkData(await this.loadData() as unknown), this));
		this.registerView(VIEW_TYPE, (leaf) => new AdvancedBookmarksView(leaf, this.controller));
		this.addSettingTab(new AdvancedBookmarksSettingTab(this.app, this));
		registerCommands(this);
		this.app.workspace.onLayoutReady(() => { void this.controller.core.refresh(); });
	}
}

import { App, PluginSettingTab, Setting } from 'obsidian';
import type AdvancedBookmarksPlugin from './main';
import { vaultDirectory } from './model/paths';

// The declarative settings API is not available in our minimum supported Obsidian version.
export class AdvancedBookmarksSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: AdvancedBookmarksPlugin) { super(app, plugin); }
	display(): void {
		this.containerEl.empty();
		const controller = this.plugin.controller;
		new Setting(this.containerEl).setName('Show file type icons').setDesc('Show icons beside notes and file bookmarks. Emoji in bookmark titles are kept.')
			.addToggle((toggle) => toggle.setValue(controller.data.settings.showFileIcons).onChange(async (value) => {
				controller.data.settings.showFileIcons = value; await controller.save();
			}));
		new Setting(this.containerEl).setName('Show note counts').setDesc('Show the number of matching notes beside dynamic folders.')
			.addToggle((toggle) => toggle.setValue(controller.data.settings.showCounts).onChange(async (value) => {
				controller.data.settings.showCounts = value; await controller.save();
			}));
		const location = new Setting(this.containerEl).setName('Folder note location').setDesc('Vault folder for newly created bookmark folder notes. Leave empty to use the vault root.')
			.addText((text) => text.setPlaceholder('Bookmark notes').setValue(controller.data.settings.folderNoteDirectory)
				.onChange(async (value) => {
					const path = vaultDirectory(value);
					location.setDesc(path === null ? 'Enter a relative vault folder without .. or special characters.'
						: 'Vault folder for newly created bookmark folder notes. Leave empty to use the vault root.');
					if (path !== null) { controller.data.settings.folderNoteDirectory = path; await controller.save(); }
				}));
		new Setting(this.containerEl).setName('Built-in bookmarks').setDesc('Drag to reorder built-in bookmarks or move them between built-in groups. Changes also appear in the built-in bookmarks pane.');
	}
}

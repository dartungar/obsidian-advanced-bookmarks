import { App, PluginSettingTab } from 'obsidian';
import type { SettingDefinitionItem } from 'obsidian';
import type AdvancedBookmarksPlugin from './main';
import type { BookmarkData } from './types';
import { vaultDirectory } from './model/paths';

export class AdvancedBookmarksSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: AdvancedBookmarksPlugin) { super(app, plugin); }

	getSettingDefinitions(): SettingDefinitionItem<keyof BookmarkData['settings']>[] {
		return [
			{
				name: 'Show file type icons',
				desc: 'Show icons beside notes and file bookmarks. Emoji in bookmark titles are kept.',
				control: { type: 'toggle', key: 'showFileIcons' },
			},
			{
				name: 'Show note counts',
				desc: 'Show the number of matching notes beside dynamic folders.',
				control: { type: 'toggle', key: 'showCounts' },
			},
			{
				name: 'Folder note location',
				desc: 'Vault folder for newly created bookmark folder notes. Leave empty to use the vault root.',
				control: {
					type: 'text', key: 'folderNoteDirectory', placeholder: 'Bookmark notes',
					validate: (value) => vaultDirectory(value) === null
						? 'Enter a relative vault folder without .. or special characters.' : undefined,
				},
			},
			{
				name: 'Built-in bookmarks',
				desc: 'Drag to reorder built-in bookmarks or move them between built-in groups. Changes also appear in the built-in bookmarks pane.',
			},
		];
	}

	getControlValue(key: string): unknown {
		if (key === 'showFileIcons' || key === 'showCounts' || key === 'folderNoteDirectory') {
			return this.plugin.controller.data.settings[key];
		}
		return undefined;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const controller = this.plugin.controller;
		if ((key === 'showFileIcons' || key === 'showCounts') && typeof value === 'boolean') {
			controller.data.settings[key] = value;
		} else if (key === 'folderNoteDirectory' && typeof value === 'string') {
			const path = vaultDirectory(value);
			if (path === null) return;
			controller.data.settings.folderNoteDirectory = path;
		} else return;
		// Save the complete plugin data and notify open sidebars of the change.
		await controller.save();
	}
}

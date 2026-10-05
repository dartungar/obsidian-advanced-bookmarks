import type AdvancedBookmarksPlugin from '../main';

export function registerOpenBookmarksCommand(plugin: AdvancedBookmarksPlugin, callback: () => Promise<void>): void {
	// Keep the released ID so existing hotkeys and command links continue to work.
	plugin.addCommand({ id: 'open-advanced-bookmarks', name: 'Open bookmarks', callback });
}

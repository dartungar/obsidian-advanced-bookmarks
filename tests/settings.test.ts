import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { App } from 'obsidian';
import type AdvancedBookmarksPlugin from '../src/main';
import type { BookmarkData } from '../src/types';
import { defaultData, loadBookmarkData } from '../src/model/data';
import { BookmarkController } from '../src/services/controller';
import { AdvancedBookmarksSettingTab } from '../src/settings';

function fixture() {
	const app = {} as App;
	const snapshots: BookmarkData[] = [];
	const plugin = { saveData: (data: BookmarkData) => { snapshots.push(data); return Promise.resolve(); } };
	const data = defaultData();
	data.folderNotes['core:group:1'] = 'Overview.md';
	data.collapsed = ['core:group:1'];
	data.itemOrder.root = ['core:group:1'];
	const controller = new BookmarkController(app, data, plugin as unknown as AdvancedBookmarksPlugin);
	const tab = new AdvancedBookmarksSettingTab(app, { ...plugin, controller } as unknown as AdvancedBookmarksPlugin);
	return { tab, controller, snapshots };
}

void test('declarative settings expose searchable names without saving or using display', () => {
	const { tab, snapshots } = fixture();
	const definitions = tab.getSettingDefinitions();
	assert.deepEqual(definitions.map((definition) => 'name' in definition ? definition.name : undefined),
		['Show file type icons', 'Show note counts', 'Folder note location', 'Built-in bookmarks']);
	assert.equal(Object.prototype.hasOwnProperty.call(AdvancedBookmarksSettingTab.prototype, 'display'), false);
	assert.equal(snapshots.length, 0);
	assert.equal(tab.getControlValue('showFileIcons'), true);
	assert.equal(tab.getControlValue('showCounts'), true);
	assert.equal(tab.getControlValue('folderNoteDirectory'), 'Bookmark notes');
});

void test('declarative changes persist complete plugin data and update sidebar subscribers', async () => {
	const { tab, controller, snapshots } = fixture();
	let updates = 0;
	const unsubscribe = controller.subscribe(() => { updates++; });
	await tab.setControlValue('showFileIcons', false);
	await tab.setControlValue('showCounts', false);
	await tab.setControlValue('folderNoteDirectory', ' Notes\\Projects/ ');
	assert.equal(updates, 3);
	assert.equal(snapshots.length, 3);
	assert.equal(snapshots[0]?.settings.showCounts, true);
	assert.deepEqual(loadBookmarkData(snapshots.at(-1)), controller.data);
	assert.deepEqual(controller.data.settings, { showFileIcons: false, showCounts: false, folderNoteDirectory: 'Notes/Projects' });
	assert.deepEqual(snapshots.at(-1)?.folderNotes, { 'core:group:1': 'Overview.md' });
	assert.deepEqual(snapshots.at(-1)?.collapsed, ['core:group:1']);
	assert.deepEqual(snapshots.at(-1)?.itemOrder, { root: ['core:group:1'] });
	unsubscribe();
});

void test('folder validation rejects unsafe paths, preserves stored values, and accepts the vault root', async () => {
	const { tab, controller, snapshots } = fixture();
	const definition = tab.getSettingDefinitions().find((item) => 'control' in item && item.control?.key === 'folderNoteDirectory');
	assert.ok(definition && 'control' in definition && definition.control?.type === 'text');
	const validate = definition.control.validate;
	assert.ok(validate);
	for (const value of ['../Outside', '/absolute', 'C:\\Notes', 'Notes/?', 'Notes\nOutside']) {
		assert.match(String(await validate(value)), /relative vault folder/);
		await tab.setControlValue('folderNoteDirectory', value);
	}
	assert.equal(snapshots.length, 0);
	assert.equal(controller.data.settings.folderNoteDirectory, 'Bookmark notes');
	assert.equal(await validate(''), undefined);
	await tab.setControlValue('folderNoteDirectory', '');
	assert.equal(tab.getControlValue('folderNoteDirectory'), '');
	assert.equal(snapshots.length, 1);
	await tab.setControlValue('__proto__', {});
	await tab.setControlValue('showCounts', 'false');
	await tab.setControlValue('folderNoteDirectory', null);
	assert.equal(tab.getControlValue('__proto__'), undefined);
	assert.equal(snapshots.length, 1);
});

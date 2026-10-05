import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { App } from 'obsidian';
import { CoreBookmarks } from '../src/bookmarks/core';
import { Notice } from './obsidian-stub';

function fixture() {
	let supported = true, dialogs = 0;
	const executions: string[] = [];
	const checks: boolean[] = [];
	const command = { checkCallback(checking: boolean) {
		checks.push(checking); if (!supported) return false;
		if (!checking) dialogs++; return true;
	} };
	const app = {
		internalPlugins: { plugins: { bookmarks: { enabled: true, instance: { items: [] } } } },
		commands: { commands: { 'bookmarks:bookmark-current-view': command }, executeCommandById(id: string) {
			executions.push(id); return command.checkCallback(false);
		} },
	};
	return { app, core: new CoreBookmarks(app as unknown as App, () => {}), executions, checks,
		setSupported: (value: boolean) => { supported = value; }, dialogs: () => dialogs };
}

void test('bookmark current tab delegates to the native add/edit dialog without writes or duplicate handling', () => {
	const source = fixture();
	assert.equal(source.core.canBookmarkCurrentTab(), true); assert.equal(source.dialogs(), 0);
	assert.equal(source.core.bookmarkCurrentTab(), true);
	assert.deepEqual(source.executions, ['bookmarks:bookmark-current-view']);
	assert.deepEqual(source.checks, [true, true, false]);
	assert.equal(source.dialogs(), 1);
	assert.deepEqual(source.app.internalPlugins.plugins.bookmarks.instance.items, []);
});

void test('disabled core, unsupported tabs, changed interfaces, and execution errors remain guarded', () => {
	const source = fixture();
	source.setSupported(false);
	assert.equal(source.core.canBookmarkCurrentTab(), false); assert.equal(source.core.bookmarkCurrentTab(), false);
	assert.match(Notice.messages.at(-1) ?? '', /cannot be bookmarked/); assert.equal(source.executions.length, 0);
	source.setSupported(true); source.app.internalPlugins.plugins.bookmarks.enabled = false;
	assert.equal(source.core.canBookmarkCurrentTab(), false); assert.equal(source.core.bookmarkCurrentTab(), false);
	assert.match(Notice.messages.at(-1) ?? '', /Enable core bookmarks/);
	source.app.internalPlugins.plugins.bookmarks.enabled = true;
	Object.assign(source.app.commands, { commands: {} });
	assert.equal(source.core.bookmarkCurrentTab(), false); assert.match(Notice.messages.at(-1) ?? '', /unavailable/);
	const broken = fixture(); broken.app.commands.executeCommandById = () => { throw new Error('Native failure'); };
	assert.equal(broken.core.bookmarkCurrentTab(), false); assert.match(Notice.messages.at(-1) ?? '', /Could not open/);
});

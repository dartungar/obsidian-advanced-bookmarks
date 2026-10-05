import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { WorkspaceLeaf } from 'obsidian';
import { TreeMenu } from '../src/ui/tree-menu';
import type { BookmarkController } from '../src/services/controller';
import { Menu, Platform } from './obsidian-stub';

void test('generated notes offer the correct pane modes, reveal, and file-menu extension without removing a match', async () => {
	const file = { path: 'Match.md' }, opened: unknown[][] = [], revealed: unknown[] = [], events: unknown[][] = [];
	const app = { vault: { getFileByPath: () => file }, workspace: {
		getLeaf: (type: string) => ({ openFile: (file: unknown) => { opened.push([type, file]); } }),
		trigger: (...args: unknown[]) => { events.push(args); (args[1] as Menu).addItem((item) => item.setTitle('Bookmark')); },
	}, internalPlugins: { getEnabledPluginById: () => ({ revealInFolder: (file: unknown) => { revealed.push(file); } }) } };
	const menu = new TreeMenu({ app, core: {} } as unknown as BookmarkController, {} as WorkspaceLeaf);
	let prevented = 0, stopped = 0;
	const event = { preventDefault: () => { prevented++; }, stopPropagation: () => { stopped++; } } as unknown as MouseEvent;
	const node = { type: 'note' as const, id: 'custom:test:Match.md', name: 'Match', path: file.path, children: [] };
	menu.show(node, {} as HTMLElement, event);
	const shown = Menu.shown.at(-1)!;
	assert.deepEqual(shown.items.map((item) => item.title), ['Open in new tab', 'Open to the right', 'Open in new window', 'Reveal file in navigation', 'Bookmark']);
	for (const item of shown.items.slice(0, 4)) await item.callback!();
	assert.deepEqual(opened, [['tab', file], ['split', file], ['window', file]]); assert.deepEqual(revealed, [file]);
	assert.deepEqual(events[0], ['file-menu', shown, file, 'advanced-bookmarks']); assert.equal(prevented, 1); assert.equal(stopped, 1);
	Platform.isMobile = true;
	try { menu.show(node, {} as HTMLElement, event); assert.equal(Menu.shown.at(-1)!.items.some((item) => item.title === 'Open in new window'), false); }
	finally { Platform.isMobile = false; }
});

void test('missing generated notes and unavailable core menus do not offer bookmark mutations', () => {
	const controller = { app: { vault: { getFileByPath: () => null } }, core: { menuTarget: () => null, open: () => {} } };
	const menu = new TreeMenu(controller as unknown as BookmarkController, {} as WorkspaceLeaf);
	const event = { preventDefault: () => {}, stopPropagation: () => {} } as unknown as MouseEvent;
	menu.show({ type: 'note', id: 'note', name: 'Missing', path: 'Missing.md', children: [] }, {} as HTMLElement, event);
	assert.equal(Menu.shown.at(-1)!.items[0]!.disabled, true);
	menu.show({ type: 'core', id: 'core:file:1', name: 'Core note', children: [], bookmark: {
		id: 'core:file:1', type: 'file', title: 'Core note', path: 'Core.md', subpath: '', items: [], original: {}, query: '', url: '',
	} }, {} as HTMLElement, event);
	assert.deepEqual(Menu.shown.at(-1)!.items.map((item) => item.title), ['Open in new tab', 'Enable core bookmarks for bookmark actions']);
	assert.equal(Menu.shown.at(-1)!.items[1]!.disabled, true);
});

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { App } from 'obsidian';
import type AdvancedBookmarksPlugin from '../src/main';
import type { BookmarkFolder, NoteDescriptor } from '../src/types';
import { defaultData, loadBookmarkData, updateNotePaths } from '../src/model/data';
import { isDraggable, locateNode, mergeManualOrder, orderSiblings, planMove } from '../src/model/order';
import { buildTree } from '../src/model/tree';
import { sortNotes } from '../src/model/sorting';
import { parseBookmarks } from '../src/bookmarks/parse';
import { BookmarkController } from '../src/services/controller';
import { moveTreeItem } from '../src/services/reordering';

const group: BookmarkFolder = { id: 'custom:group', kind: 'group', name: 'Group', parentId: null, match: 'all', rules: [], sort: 'name' };
const dynamic: BookmarkFolder = { ...group, id: 'custom:dynamic', kind: 'dynamic', name: 'Dynamic', sort: 'manual',
	rules: [{ field: 'tag', operator: 'is', value: 'work', property: '', negate: false }] };
const notes: NoteDescriptor[] = ['A', 'B', 'C'].map((name) => ({ path: `${name}.md`, name, mtime: 1, ctime: 1, tags: ['#work'], properties: {} }));
const core = () => parseBookmarks([{ type: 'file', ctime: 1, path: 'A.md', extra: { untouched: true } },
	{ type: 'file', ctime: 2, path: 'B.md' }, { type: 'group', ctime: 3, title: 'Core group', items: [{ type: 'file', ctime: 4, path: 'C.md' }] }]);
const tree = () => buildTree(core(), [group, dynamic], notes, {});

void test('manual ordering keeps saved paths, appends new matches, and follows vault renames', () => {
	const folder = { ...dynamic, manualOrder: ['C.md', 'A.md'] };
	assert.deepEqual(sortNotes(notes, folder).map((note) => note.path), ['C.md', 'A.md', 'B.md']);
	assert.deepEqual(sortNotes(notes.slice(0, 2), folder).map((note) => note.path), ['A.md', 'B.md']);
	assert.deepEqual(mergeManualOrder(['Hidden.md', 'A.md', 'B.md'], ['B.md', 'A.md', 'C.md']), ['Hidden.md', 'B.md', 'A.md', 'C.md']);
	const data = loadBookmarkData({ folders: [{ ...folder, manualOrder: ['Work/C.md', 'Work-old/B.md', 'A.md'] }] });
	updateNotePaths(data, 'Work', 'Personal');
	assert.deepEqual(data.folders[0]!.manualOrder, ['Personal/C.md', 'Work-old/B.md', 'A.md']);
	updateNotePaths(data, 'A.md', 'Renamed.md');
	assert.equal(data.folders[0]!.manualOrder?.at(-1), 'Renamed.md');
});

void test('manual drops reorder only matching notes within their own manual dynamic folder', () => {
	const nodes = tree();
	const source = `${dynamic.id}:C.md`, target = `${dynamic.id}:A.md`;
	assert.deepEqual(planMove(nodes, source, target, 'before'), { type: 'manual', folderId: dynamic.id, paths: ['C.md', 'A.md', 'B.md'] });
	assert.equal(planMove(nodes, source, group.id, 'inside'), null);
	assert.equal(planMove(nodes, source, target, 'inside'), null);
	const sorted = buildTree(core(), [{ ...dynamic, sort: 'title' }], notes, {});
	assert.equal(planMove(sorted, source, target, 'before'), null);
	const vault = buildTree(parseBookmarks([{ type: 'folder', ctime: 5, path: '' }]), [], notes, {});
	assert.equal(isDraggable(vault[0]!.children[0]!, vault[0]!), false);
});

void test('static drop plans preserve native insertion indices and support built-in group moves', () => {
	const nodes = tree();
	let plan = planMove(nodes, 'core:file:1', 'core:file:2', 'after');
	assert.ok(plan?.type === 'static'); assert.equal(plan.beforeCoreId, 'core:group:3');
	assert.deepEqual(plan.ids.slice(0, 2), ['core:file:2', 'core:file:1']);
	plan = planMove(nodes, 'core:file:1', 'core:group:3', 'inside');
	assert.ok(plan?.type === 'static'); assert.equal(plan.parentId, 'core:group:3'); assert.equal(plan.beforeCoreId, null);
	assert.equal(planMove(nodes, 'core:group:3', 'core:file:4', 'after'), null);
	assert.equal(planMove(nodes, 'core:file:1', group.id, 'inside'), null);
	assert.equal(planMove(nodes, group.id, group.id, 'inside'), null);
});

void test('custom folders can move into native/custom folders without cycles', () => {
	const nodes = tree();
	const plan = planMove(nodes, group.id, dynamic.id, 'inside');
	assert.ok(plan?.type === 'static'); assert.equal(plan.parentId, dynamic.id);
	const nested = buildTree(core(), [group, { ...dynamic, parentId: group.id }], notes, {});
	assert.equal(planMove(nested, group.id, dynamic.id, 'inside'), null);
	assert.ok(planMove(nodes, dynamic.id, 'core:group:3', 'inside'));
	assert.equal(planMove(nodes, group.id, `${dynamic.id}:A.md`, 'after'), null);
});

void test('saved custom slots never override external changes to core bookmark order', () => {
	const nodes = tree();
	const saved = [nodes[0]!.id, group.id, nodes[1]!.id, dynamic.id, nodes[2]!.id];
	const ordered = orderSiblings(nodes, saved);
	assert.deepEqual(ordered.map((node) => node.id), saved);
	const external = [nodes[1]!, nodes[0]!, nodes[2]!, nodes[3]!, nodes[4]!];
	assert.deepEqual(orderSiblings(external, saved).map((node) => node.id), [nodes[1]!.id, group.id, nodes[0]!.id, dynamic.id, nodes[2]!.id]);
	assert.equal(orderSiblings(nodes, ['missing', group.id, group.id]).length, nodes.length);
});

void test('saved orders and icon setting validate and old settings retain their defaults', () => {
	const data = loadBookmarkData({ folders: [{ ...dynamic, manualOrder: ['A.md', null, 'A.md'] }],
		itemOrder: JSON.parse('{"root":["custom:dynamic",42,"custom:dynamic"],"__proto__":["bad"]}') as unknown,
		settings: { showFileIcons: false } });
	assert.deepEqual(data.folders[0]!.manualOrder, ['A.md']);
	assert.deepEqual(data.itemOrder, { root: ['custom:dynamic'] });
	assert.equal(data.settings.showFileIcons, false);
	assert.equal(loadBookmarkData({ settings: {} }).settings.showFileIcons, true);
});

function controllerFixture() {
	const raw = core().map((item) => item.original);
	const calls: { item: unknown; parent: unknown; index: number }[] = [];
	const saved: unknown[] = [];
	const children = (item: Record<string, unknown> | null): Record<string, unknown>[] => item ? item.items as Record<string, unknown>[] : raw;
	const locate = (entries: Record<string, unknown>[], item: Record<string, unknown>): Record<string, unknown>[] | null => {
		if (entries.includes(item)) return entries;
		for (const value of entries) if (Array.isArray(value.items)) { const found = locate(value.items as Record<string, unknown>[], item); if (found) return found; }
		return null;
	};
	const instance = { items: raw, moveItem(item: Record<string, unknown>, parent: Record<string, unknown> | null, index: number) {
		calls.push({ item, parent, index });
		const from = locate(raw, item)!; const destination = children(parent); const oldIndex = from.indexOf(item);
		from.splice(oldIndex, 1); if (from === destination && oldIndex < index) index--;
		destination.splice(index, 0, item);
	} };
	const app = { internalPlugins: { plugins: { bookmarks: { enabled: true, instance } } },
		vault: { getMarkdownFiles: () => notes.map((note) => ({ path: note.path, basename: note.name, stat: { mtime: 1, ctime: 1 } })) },
		metadataCache: { getFileCache: () => ({ tags: [{ tag: '#work' }] }) } } as unknown as App;
	const data = defaultData(); data.folders = [{ ...group }, { ...dynamic, manualOrder: ['Hidden.md'] }];
	const plugin = { saveData: async (value: unknown) => { saved.push(value); } } as unknown as AdvancedBookmarksPlugin;
	const controller = new BookmarkController(app, data, plugin);
	return { controller, instance, raw, calls, saved };
}

void test('native reordering calls core with live objects, preserves metadata, and syncs both panes', async () => {
	const { controller, raw, calls, saved } = controllerFixture(); await controller.core.refresh();
	const source = raw[0];
	assert.ok(source);
	assert.equal(await moveTreeItem(controller, 'core:file:1', 'core:file:2', 'after'), true);
	assert.deepEqual(calls[0], { item: source, parent: null, index: 2 });
	assert.equal(raw[1], source); assert.deepEqual(source.extra, { untouched: true });
	assert.equal(saved.length, 1);
	assert.deepEqual(controller.core.items.slice(0, 2).map((item) => item.id), ['core:file:2', 'core:file:1']);
	assert.equal(await moveTreeItem(controller, 'core:file:1', 'core:group:3', 'inside'), true);
	assert.equal(controller.core.items.find((item) => item.type === 'group')?.items.at(-1)?.original, source);
	assert.equal(await moveTreeItem(controller, 'core:group:3', 'core:file:1', 'inside'), false);
});

void test('custom and manual moves persist, reload correctly, and keep independent folder order', async () => {
	const { controller } = controllerFixture(); await controller.core.refresh();
	assert.equal(await moveTreeItem(controller, group.id, 'core:file:1', 'before'), true);
	assert.equal(controller.data.itemOrder.root?.[0], group.id);
	assert.equal(await moveTreeItem(controller, group.id, dynamic.id, 'inside'), true);
	assert.equal(controller.data.folders[0]!.parentId, dynamic.id);
	assert.equal(await moveTreeItem(controller, `${dynamic.id}:C.md`, `${dynamic.id}:A.md`, 'before'), true);
	assert.deepEqual(controller.data.folders[1]!.manualOrder, ['Hidden.md', 'C.md', 'A.md', 'B.md']);
	const loaded = loadBookmarkData(JSON.parse(JSON.stringify(controller.data)) as unknown);
	const rebuilt = buildTree(controller.core.items, loaded.folders, notes, {}, undefined, loaded.itemOrder);
	assert.deepEqual(locateNode(rebuilt, dynamic.id)?.node.children.filter((node) => node.type === 'note').map((node) => node.name), ['C', 'A', 'B']);
	await controller.deleteFolder(dynamic.id);
	assert.equal(Object.prototype.hasOwnProperty.call(controller.data.itemOrder, dynamic.id), false);
	assert.equal(controller.data.itemOrder.root?.includes(dynamic.id), false);
});

void test('unsupported native mutation never writes fallback bookmark data', async () => {
	const { controller, instance, saved } = controllerFixture(); await controller.core.refresh();
	Object.assign(instance, { moveItem: undefined });
	assert.equal(controller.core.canMove(), false);
	assert.equal(await moveTreeItem(controller, 'core:file:1', 'core:file:2', 'after'), false);
	assert.equal(saved.length, 0); assert.deepEqual(controller.data.itemOrder, {});
});

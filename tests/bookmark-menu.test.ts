import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { App, WorkspaceLeaf } from 'obsidian';
import { CoreBookmarks } from '../src/bookmarks/core';
import { CoreBookmarkMenus } from '../src/bookmarks/menu';
import { BookmarkRenameModal } from '../src/ui/bookmark-rename-modal';
import { Menu, Modal, Notice } from './obsidian-stub';

// Model constructor-time DOM attachment without loading the native view.
class Container {
	children: Container[] = [];
	parent: Container | null = null;
	removed = false;
	ownerDocument = { createElement: (_tag: string) => new Container() };
	appendChild(child: Container): void { this.children.push(child); child.parent = this; }
	remove(): void {
		this.removed = true;
		if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
		this.parent = null;
	}
}

function fixture() {
	const file = { type: 'file', ctime: 1, path: 'Note.md', subpath: '#Heading', title: 'Note' };
	const group = { type: 'group', ctime: 2, title: 'Group', items: [file] };
	const items = [group];
	const opened: unknown[][] = [], removed: unknown[] = [], edited: unknown[] = [], saves: boolean[] = [];
	const handlers = new Set<(...args: unknown[]) => unknown>();
	const plugin = { items, getItemTitle: (item: { title: string }) => item.title,
		onItemsChanged: (save: boolean) => saves.push(save),
		openBookmark: (...args: unknown[]) => { opened.push(args); },
		removeItem: (item: unknown) => { removed.push(item); },
	};
	const view = {
		plugin, tree: { selectedDoms: new Set(['unrelated selection']) }, unloaded: 0, loaded: 0,
		load() { this.loaded++; }, unload() { this.unloaded++; }, containerEl: new Container(),
		createNewGroup(this: { plugin: typeof plugin; update: () => void; getItemDom: (item: unknown) => { startRename: () => void } }, _parent: unknown) {
			const item = { type: 'group', ctime: 3, title: 'New group', items: [] }; this.plugin.items.push(item);
			this.update(); this.getItemDom(item).startRename();
		},
		getItemDom(_item: unknown) { return { onContextMenu(this: { item: unknown; startRename: () => void; selfEl: unknown;
			view: { plugin: typeof plugin; tree: { selectedDoms: Set<unknown> }; createNewGroup: (parent: unknown) => void } }, _event: unknown) {
			assert.equal(this.view.tree.selectedDoms.size, 0);
			const menu = new Menu();
			for (const pane of ['tab', 'split', 'window']) menu.addItem((item) => item.setTitle(pane).onClick(() => this.view.plugin.openBookmark(this.item, pane)));
			menu.addItem((item) => item.setTitle('Rename').onClick(() => this.startRename()));
			menu.addItem((item) => item.setTitle('Edit').onClick(() => { edited.push(this.item); }));
			menu.addItem((item) => item.setTitle('Remove').onClick(() => this.view.plugin.removeItem(this.item)));
			menu.addItem((item) => item.setTitle('New group').onClick(() => this.view.createNewGroup(this.item)));
			for (const handler of handlers) handler(menu, [this.item]);
			menu.showAtMouseEvent(_event);
		} }; },
	};
	const leaves = [{ view }];
	const liveContainer = new Container(), advancedContent = new Container();
	liveContainer.appendChild(advancedContent);
	const leaf = { containerEl: liveContainer, view: { type: 'advanced-bookmarks' } };
	let factoryLeaf: typeof leaf | null = null;
	let factories = 0;
	const app = { internalPlugins: { plugins: { bookmarks: { enabled: true, instance: plugin } } },
		workspace: { getLeavesOfType: () => leaves, on(_name: string, callback: (...args: unknown[]) => unknown) {
			handlers.add(callback); return { callback };
		}, offref(ref: { callback: (...args: unknown[]) => unknown }) { handlers.delete(ref.callback); } },
		viewRegistry: { getViewCreatorByType: () => (menuLeaf: typeof leaf) => {
			factories++; factoryLeaf = menuLeaf;
			menuLeaf.containerEl.appendChild(view.containerEl);
			// A native toolbar can change its leaf's view even before load/onOpen.
			view.containerEl.appendChild(new Container());
			return view;
		} },
	};
	const core = new CoreBookmarks(app as unknown as App, () => {});
	const menus = new CoreBookmarkMenus(app as unknown as App, core);
	const show = (id = 'core:file:1', extend?: Parameters<CoreBookmarkMenus['show']>[4]) => menus.show(id,
		{} as HTMLElement, leaf as unknown as WorkspaceLeaf, {} as MouseEvent, extend);
	return { app, core, menus, show, file, group, plugin, view, leaves, handlers, opened, removed, edited, saves,
		factories: () => factories, leaf, liveContainer, advancedContent, factoryLeaf: () => factoryLeaf };
}

void test('native bookmark menu keeps target identity, subpaths, opening modes, editing, removal, and group extensions', () => {
	const source = fixture();
	assert.equal(source.show('core:file:1'), true);
	const menu = Menu.shown.at(-1)!;
	for (const item of menu.items.slice(0, 3)) item.callback!();
	assert.deepEqual(source.opened, [[source.file, 'tab'], [source.file, 'split'], [source.file, 'window']]);
	menu.items.find((item) => item.title === 'Edit')!.callback!();
	menu.items.find((item) => item.title === 'Remove')!.callback!();
	assert.equal(source.edited[0], source.file); assert.equal(source.removed[0], source.file);
	assert.equal(source.file.subpath, '#Heading'); assert.equal(source.factories(), 0);
	assert.equal(source.show('core:group:2', (menu) => menu.addItem((item) => item.setTitle('Folder note'))), true);
	assert.equal(Menu.shown.at(-1)!.items.at(-1)!.title, 'Folder note');
	assert.equal(source.handlers.size, 0); assert.equal(source.view.tree.selectedDoms.size, 1);
});

void test('rename uses a dialog in this pane and persists through core, guarding removed bookmarks and failures', async () => {
	const source = fixture(); source.show();
	Menu.shown.at(-1)!.items.find((item) => item.title === 'Rename')!.callback!();
	assert.ok(Modal.opened.at(-1) instanceof BookmarkRenameModal);
	assert.equal(await source.core.rename(source.file, ' New title '), true);
	assert.equal(source.file.title, 'New title'); assert.deepEqual(source.saves, [true]);
	source.group.items = [];
	assert.equal(await source.core.rename(source.file, 'Removed'), false); assert.equal(source.file.title, 'New title');
	assert.match(Notice.messages.at(-1)!, /unavailable/);
	source.group.items = [source.file]; source.plugin.onItemsChanged = () => { throw new Error('failure'); };
	assert.equal(await source.core.rename(source.file, 'Bad write'), false); assert.equal(source.file.title, 'New title');
});

void test('native new group invokes its own creation method and opens a visible rename dialog', () => {
	const source = fixture(); source.show('core:group:2');
	Menu.shown.at(-1)!.items.find((item) => item.title === 'New group')!.callback!();
	assert.equal(source.plugin.items.length, 2); assert.ok(Modal.opened.at(-1) instanceof BookmarkRenameModal);
});

void test('closed core pane uses a reusable unloaded native view with disposal; disabled and missing targets fail closed', () => {
	const source = fixture(); source.leaves.splice(0); source.menus.load();
	assert.equal(source.show(), true); assert.equal(source.show(), true);
	assert.equal(source.factories(), 1); assert.equal(source.view.loaded, 0);
	assert.equal(source.show('core:file:99'), false);
	source.app.internalPlugins.plugins.bookmarks.enabled = false;
	assert.equal(source.show(), false);
	const detachedContainer = source.factoryLeaf()!.containerEl;
	source.menus.unload(); assert.equal(source.view.unloaded, 1); assert.equal(detachedContainer.removed, true);
	assert.equal(source.liveContainer.removed, false);
	const broken = fixture(); broken.view.getItemDom = () => { throw new Error('changed contract'); };
	assert.equal(broken.show(), false); assert.equal(broken.handlers.size, 0);
});

void test('native menu construction and disposal leave the advanced pane DOM and view untouched', () => {
	const source = fixture(); source.leaves.splice(0); source.menus.load();
	const advancedView = source.leaf.view;
	assert.equal(source.show('core:group:2'), true);
	const menuLeaf = source.factoryLeaf()!;
	assert.notEqual(menuLeaf, source.leaf);
	assert.notEqual(menuLeaf.containerEl, source.liveContainer);
	assert.equal(menuLeaf.containerEl.parent, null);
	assert.deepEqual(menuLeaf.containerEl.children, [source.view.containerEl]);
	assert.deepEqual(source.liveContainer.children, [source.advancedContent]);
	menuLeaf.view = { type: 'bookmarks' };
	assert.equal(source.leaf.view, advancedView);
	Menu.shown.at(-1)!.items.find((item) => item.title === 'New group')!.callback!();
	assert.ok(Modal.opened.at(-1) instanceof BookmarkRenameModal);
	assert.equal(source.show(), true); assert.equal(source.factories(), 1);
	source.menus.unload();
	assert.equal(menuLeaf.containerEl.removed, true);
	assert.deepEqual(source.liveContainer.children, [source.advancedContent]);
	assert.equal(source.leaf.view, advancedView);
});

void test('a failed native constructor cleans up only its detached container', () => {
	const source = fixture(); source.leaves.splice(0);
	const factory = source.app.viewRegistry.getViewCreatorByType();
	source.app.viewRegistry.getViewCreatorByType = () => (leaf) => {
		factory(leaf); throw new Error('Native constructor failed');
	};
	assert.equal(source.show(), false);
	assert.equal(source.factoryLeaf()!.containerEl.removed, true);
	assert.deepEqual(source.liveContainer.children, [source.advancedContent]);
	assert.equal(source.liveContainer.removed, false);
	assert.equal(source.handlers.size, 0);
});

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { App } from 'obsidian';
import type AdvancedBookmarksPlugin from '../src/main';
import { CoreBookmarks } from '../src/bookmarks/core';
import { parseBookmarks } from '../src/bookmarks/parse';
import { BookmarkController } from '../src/services/controller';
import { FolderNotes } from '../src/services/folder-notes';
import { defaultData } from '../src/model/data';
import { Notice } from './obsidian-stub';

function fakeApp() {
	const events = new Map<string, Set<(...args: unknown[]) => void>>();
	const on = (name: string, callback: (...args: unknown[]) => void) => {
		const callbacks = events.get(name) ?? new Set();
		callbacks.add(callback); events.set(name, callbacks);
		return { off: () => { callbacks.delete(callback); } };
	};
	const files = new Map<string, { path: string; basename: string; stat: { mtime: number } }>();
	const created: { path: string; content: string }[] = [];
	const opened: string[] = [];
	const openOptions: unknown[] = [];
	const states: unknown[] = [];
	const graphOpened: unknown[][] = [];
	const app = {
		internalPlugins: { plugins: { bookmarks: { enabled: true, instance: { items: [] as unknown[],
			openBookmark: (...args: unknown[]) => { graphOpened.push(args); return Promise.resolve(); } } } } },
		vault: {
			configDir: '.custom-config',
			on,
			adapter: { exists: () => Promise.resolve(true), read: () => Promise.resolve('{"items":[]}') },
			getFileByPath: (path: string) => files.get(path),
			getAbstractFileByPath: (path: string) => files.get(path),
			getMarkdownFiles: () => [...files.values()],
			createFolder: (path: string) => { files.set(path, { path, basename: '', stat: { mtime: 0 } }); return Promise.resolve(); },
			create: (path: string, content: string) => {
				assert.equal(files.has(path), false);
				const file = { path, basename: path, stat: { mtime: 0 } };
				files.set(path, file); created.push({ path, content }); return Promise.resolve(file);
			},
		},
		metadataCache: { on, getFileCache: () => ({ tags: [{ tag: '#work' }] }) },
		workspace: {
			getLeavesOfType: () => [],
			getLeftLeaf: () => ({ setViewState: (state: unknown) => { states.push(state); return Promise.resolve(); } }),
			revealLeaf: () => Promise.resolve(),
			getLeaf: () => ({ openFile: (file: { path: string }, options?: unknown) => {
				opened.push(file.path); openOptions.push(options); return Promise.resolve();
			} }),
			openLinkText: (path: string) => { opened.push(path); return Promise.resolve(); },
		},
	};
	return { app, asApp: app as unknown as App, files, events, created, opened, openOptions, states, graphOpened };
}

void test('core adapter reads live items without disk access and updates after removal', async () => {
	const fake = fakeApp();
	let reads = 0;
	fake.app.vault.adapter.read = () => { reads++; return Promise.resolve(''); };
	fake.app.internalPlugins.plugins.bookmarks.instance.items.push({ type: 'file', path: 'Plan.md', ctime: 1 });
	let changes = 0;
	const core = new CoreBookmarks(fake.asApp, () => { changes++; });
	core.load(); await core.refresh(); await core.refresh();
	assert.equal(core.items.length, 1); assert.equal(reads, 0); assert.equal(changes, 1);
	fake.app.internalPlugins.plugins.bookmarks.instance.items = [];
	await core.refresh(); assert.equal(core.items.length, 0); assert.equal(changes, 2);
	core.unload(); await core.refresh(); assert.equal(changes, 2);
});

void test('core adapter uses the vault config directory and recovers after a read error', async () => {
	const fake = fakeApp();
	fake.app.internalPlugins.plugins.bookmarks.enabled = false;
	const paths: string[] = [];
	let fail = false;
	fake.app.vault.adapter.read = (path?: string) => {
		paths.push(path ?? '');
		return fail ? Promise.reject(new Error('Unreadable')) : Promise.resolve('{"items":[{"type":"group","ctime":1,"title":"Work"}]}');
	};
	const core = new CoreBookmarks(fake.asApp, () => {});
	core.load(); await core.refresh();
	assert.deepEqual(paths, ['.custom-config/bookmarks.json']);
	assert.match(core.status, /saved bookmarks/);
	fail = true; await core.refresh(); assert.match(core.status, /Could not read/); assert.equal(core.items.length, 1);
	fail = false; await core.refresh(); assert.match(core.status, /saved bookmarks/);
	core.unload();
});

void test('core opens headings, searches, and native graph state; missing targets report a notice', async () => {
	const fake = fakeApp();
	fake.files.set('Plan.md', { path: 'Plan.md', basename: 'Plan', stat: { mtime: 0 } });
	const core = new CoreBookmarks(fake.asApp, () => {});
	const bookmarks = parseBookmarks([{ type: 'file', path: 'Plan.md', subpath: '#^block' },
		{ type: 'search', query: 'tag:#work' }, { type: 'graph', options: { search: 'tag:#work' } }, { type: 'file', path: 'Missing.md' }]);
	for (const bookmark of bookmarks) await core.open(bookmark, true);
	assert.deepEqual(fake.opened, ['Plan.md']);
	assert.deepEqual(fake.openOptions, [{ eState: { subpath: '#^block' } }]);
	assert.deepEqual(fake.states, [{ type: 'search', active: true, state: { query: 'tag:#work' } }]);
	assert.deepEqual(fake.graphOpened, [[bookmarks[2]?.original, 'tab']]);
	assert.match(Notice.messages.at(-1) ?? '', /Could not open/);
});

void test('controller serializes saves, retries after errors, and cleans up registered events', async () => {
	const fake = fakeApp();
	const saved: unknown[] = [];
	let fail = true;
	const plugin = { registerInterval: () => {}, saveData: (data: unknown) => {
		if (fail) { fail = false; return Promise.reject(new Error('Disk full')); }
		saved.push(data); return Promise.resolve();
	} } as unknown as AdvancedBookmarksPlugin;
	const controller = new BookmarkController(fake.asApp, defaultData(), plugin);
	const previousWindow = globalThis.window;
	Object.defineProperty(globalThis, 'window', { configurable: true, value: { setInterval: () => 1 } });
	try {
		controller.load();
		assert.equal(await controller.save(), false);
		controller.data.settings.showCounts = false;
		const first = controller.save();
		controller.data.settings.showCounts = true;
		const second = controller.save();
		assert.equal(await first, true); assert.equal(await second, true);
		assert.equal((saved[0] as ReturnType<typeof defaultData>).settings.showCounts, false);
		assert.equal((saved[1] as ReturnType<typeof defaultData>).settings.showCounts, true);
		controller.unload();
		assert.equal([...fake.events.values()].every((callbacks) => !callbacks.size), true);
	} finally { Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow }); }
});

void test('folder notes never overwrite existing content, unlink keeps files, and creation can use root', async () => {
	const fake = fakeApp();
	const data = defaultData();
	const plugin = { saveData: () => Promise.resolve() } as unknown as AdvancedBookmarksPlugin;
	const controller = new BookmarkController(fake.asApp, data, plugin);
	const notes = new FolderNotes(controller);
	fake.files.set('Bookmark notes/Work.md', { path: 'Bookmark notes/Work.md', basename: 'Work', stat: { mtime: 0 } });
	await notes.create('custom:a', 'Work');
	assert.equal(data.folderNotes['custom:a'], 'Bookmark notes/Work 1.md');
	assert.equal(fake.created.length, 1);
	await notes.create('custom:a', 'Work'); assert.equal(fake.created.length, 1);
	await notes.unlink('custom:a'); assert.equal(fake.files.has('Bookmark notes/Work 1.md'), true);
	data.settings.folderNoteDirectory = '';
	await notes.create('custom:b', 'Root'); assert.equal(data.folderNotes['custom:b'], 'Root.md');
	data.settings.folderNoteDirectory = '../outside';
	await notes.create('custom:c', 'Invalid'); assert.equal(fake.created.length, 2);
});

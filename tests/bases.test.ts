import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { App } from 'obsidian';
import { baseViewNames, nativeBaseHandler, queryNativeBase } from '../src/bases/native';
import { BaseSources } from '../src/bases/sources';
import type { BaseReference, BookmarkFolder } from '../src/types';

const reference: BaseReference = { path: 'Projects.base', view: 'Active projects' };
function fixture() {
	const files = new Map(['Projects.base', 'A.md', 'B.md', 'Image.png'].map((path) => [path, { path, extension: path.split('.').at(-1) }]));
	const calls: Record<string, string>[] = [];
	let output: unknown = 'B.md\nA.md';
	let config = JSON.stringify({ views: [{ name: 'Active projects' }, { name: 'Archived' }] });
	const handlers = new Map([['base:query', { handler: async (flags: Record<string, string>) => { calls.push(flags); return output; } }]]);
	const app = { cli: { handlers }, vault: { getFileByPath: (path: string) => files.get(path) ?? null, cachedRead: async () => config } } as unknown as App;
	return { app, calls, handlers, setOutput: (value: unknown) => { output = value; }, setConfig: (value: string) => { config = value; } };
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

void test('native Base adapter forwards the exact path/view and uses collision-safe paths output', async () => {
	const source = fixture();
	assert.deepEqual(await baseViewNames(source.app, reference.path), ['Active projects', 'Archived']);
	assert.deepEqual(await queryNativeBase(source.app, reference), ['B.md', 'A.md']);
	assert.deepEqual(source.calls, [{ path: 'Projects.base', view: 'Active projects', format: 'paths' }]);
	source.setOutput('A.md\r\nImage.png\r\nA.md');
	assert.deepEqual(await queryNativeBase(source.app, reference), ['A.md']);
	source.setOutput(''); assert.deepEqual(await queryNativeBase(source.app, reference), []);
});

void test('Base adapter validates missing files/views, duplicate names, malformed configs, and results', async () => {
	const source = fixture();
	await assert.rejects(queryNativeBase(source.app, { ...reference, path: 'missing.base' }), /existing/);
	await assert.rejects(queryNativeBase(source.app, { ...reference, path: 'A.md' }), /existing/);
	await assert.rejects(queryNativeBase(source.app, { ...reference, view: 'active projects' }), /missing/);
	assert.equal(source.calls.length, 0);
	source.setConfig(JSON.stringify({ views: [{ name: reference.view }, { name: reference.view }] }));
	await assert.rejects(queryNativeBase(source.app, reference), /duplicated/);
	source.setConfig('{}'); await assert.rejects(baseViewNames(source.app, reference.path), /no named views/);
	source.setConfig('invalid yaml'); await assert.rejects(baseViewNames(source.app, reference.path));
	source.setConfig(JSON.stringify({ views: [{ name: reference.view }] }));
	source.setOutput({ path: 'A.md' }); await assert.rejects(queryNativeBase(source.app, reference), /unsupported/);
	source.setOutput('Error: failed'); await assert.rejects(queryNativeBase(source.app, reference), /invalid/);
});

void test('unavailable or changed native interface returns a guarded error', async () => {
	const source = fixture(); source.handlers.clear();
	assert.equal(nativeBaseHandler(source.app), null);
	await assert.rejects(queryNativeBase(source.app, reference), /Enable Bases/);
	for (const runtime of [{}, { cli: {} }, { cli: { handlers: {} } }, { cli: { handlers: new Map([['base:query', {}]]) } }]) {
		assert.equal(nativeBaseHandler(runtime as App), null);
	}
});

void test('shared Base/view sources run one query and errors remain explicit', async () => {
	const source = fixture(); let calls = 0; let changes = 0;
	const sources = new BaseSources(source.app, () => { changes++; }, async () => { calls++; return ['B.md', 'A.md']; });
	sources.load();
	const folder = { id: 'custom:a', kind: 'dynamic', source: 'base', base: reference } as BookmarkFolder;
	const results = sources.results([folder, { ...folder, id: 'custom:b' }]);
	assert.equal(calls, 1); assert.equal(results.get(folder.id)?.status, 'loading');
	await settle();
	assert.equal(changes, 1); assert.deepEqual(sources.get(reference), { status: 'ready', paths: ['B.md', 'A.md'] });
	assert.equal(sources.get({ path: 'Projects.base', view: '' }).status, 'error');
	const failure = new BaseSources(source.app, () => {}, async () => { throw new Error('Invalid formula'); });
	failure.load(); failure.get(reference); await settle();
	assert.deepEqual(failure.get(reference), { status: 'error', paths: [], message: 'Invalid formula' });
	sources.unload(); failure.unload();
});

void test('invalidation and unload discard late Base results and callbacks', async () => {
	const source = fixture(); let changes = 0;
	const pending: ((paths: string[]) => void)[] = [];
	const sources = new BaseSources(source.app, () => { changes++; }, () => new Promise((resolve) => pending.push(resolve)));
	sources.load(); sources.get(reference); sources.invalidate(); sources.get(reference);
	pending[0]!(['A.md']); await settle();
	assert.equal(changes, 0); assert.equal(sources.get(reference).status, 'loading');
	pending[1]!(['B.md']); await settle();
	assert.deepEqual(sources.get(reference).paths, ['B.md']); assert.equal(changes, 1);
	sources.invalidate(); sources.get(reference); sources.unload();
	pending[2]!(['A.md']); await settle();
	assert.equal(changes, 1); sources.get(reference); assert.equal(pending.length, 3);
});

void test('native availability changes invalidate cached results without a vault event', async () => {
	const source = fixture(); let changes = 0;
	const sources = new BaseSources(source.app, () => { changes++; });
	sources.load(); sources.get(reference); await settle(); await settle();
	assert.equal(sources.get(reference).status, 'ready');
	source.handlers.clear(); sources.poll();
	assert.equal(sources.get(reference).status, 'loading'); await settle();
	assert.equal(sources.get(reference).status, 'error'); assert.ok(changes >= 2);
	sources.unload();
});

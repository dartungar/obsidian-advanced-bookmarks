import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { loadBookmarkData, updateNotePaths } from '../src/model/data';
import { matchesFolder, selectNotes } from '../src/model/rules';
import { noteTitle, sortNotes } from '../src/model/sorting';
import { buildTree } from '../src/model/tree';
import type { BaseResult, BookmarkFolder, NoteDescriptor } from '../src/types';

const notes: NoteDescriptor[] = [
	{ path: 'Work/File10.md', name: 'File10', ctime: 30, mtime: 10, tags: ['#work'], properties: { title: ' Alpha 2 ' } },
	{ path: 'Work/file2.md', name: 'file2', ctime: 10, mtime: 30, tags: ['#work'], properties: { title: 'alpha 10' } },
	{ path: 'Personal/B.md', name: 'B', ctime: 20, mtime: 20, tags: [], properties: { title: false } },
];
const folder = (overrides: Partial<BookmarkFolder> = {}): BookmarkFolder => ({ id: 'custom:base', name: 'Base', kind: 'dynamic',
	parentId: null, match: 'all', rules: [{ field: 'folder', operator: 'contains', property: '', value: '', negate: false }],
	source: 'base', base: { path: 'Projects.base', view: 'Active projects' }, sort: 'base', sortDirection: 'asc', ...overrides });
const paths = (entries: NoteDescriptor[]) => entries.map((entry) => entry.path);
const result: BaseResult = { status: 'ready', paths: [notes[1]!.path, notes[2]!.path, notes[0]!.path, notes[1]!.path, 'Missing.md'] };

void test('title sorting uses a trimmed title property with filename fallback and natural text order', () => {
	assert.equal(noteTitle(notes[0]!), 'Alpha 2');
	assert.equal(noteTitle(notes[2]!), 'B');
	assert.equal(noteTitle({ ...notes[0]!, properties: { title: '  ' } }), 'File10');
	assert.deepEqual(paths(sortNotes(notes, folder({ sort: 'title' }))), paths(notes));
	assert.deepEqual(paths(sortNotes(notes, folder({ sort: 'title', sortDirection: 'desc' }))), paths([...notes].reverse()));
	assert.deepEqual(paths(sortNotes(notes, folder({ sort: 'name' }))), [notes[2]!.path, notes[1]!.path, notes[0]!.path]);
	assert.deepEqual(paths(sortNotes(notes, folder({ sort: 'path' }))), [notes[2]!.path, notes[1]!.path, notes[0]!.path]);
});

void test('date sorting supports both directions and deterministic path ties', () => {
	assert.deepEqual(paths(sortNotes(notes, folder({ sort: 'created' }))), [notes[1]!.path, notes[2]!.path, notes[0]!.path]);
	assert.deepEqual(paths(sortNotes(notes, folder({ sort: 'created', sortDirection: 'desc' }))), [notes[0]!.path, notes[2]!.path, notes[1]!.path]);
	assert.deepEqual(paths(sortNotes(notes, folder({ sort: 'modified', sortDirection: 'asc' }))), [notes[0]!.path, notes[2]!.path, notes[1]!.path]);
	assert.deepEqual(paths(sortNotes(notes, folder({ sort: 'modified', sortDirection: 'desc' }))), [notes[1]!.path, notes[2]!.path, notes[0]!.path]);
	const ties = [notes[0]!, { ...notes[0]!, path: 'A.md' }];
	assert.deepEqual(paths(sortNotes(ties, folder({ sort: 'created', sortDirection: 'desc' }))), ['A.md', notes[0]!.path]);
});

void test('Base selection retains native view order, removes duplicates, and supports sort overrides', () => {
	assert.deepEqual(paths(selectNotes(notes, folder(), result)), [notes[1]!.path, notes[2]!.path, notes[0]!.path]);
	assert.deepEqual(paths(selectNotes(notes, folder({ sortDirection: 'desc' }), result)), [notes[0]!.path, notes[2]!.path, notes[1]!.path]);
	assert.deepEqual(paths(selectNotes(notes, folder({ sort: 'created' }), result)), [notes[1]!.path, notes[2]!.path, notes[0]!.path]);
});

void test('missing, loading, and failed Base sources never fall back to matching all notes', () => {
	assert.equal(matchesFolder(notes[0]!, folder()), false);
	for (const unavailable of [undefined, { status: 'loading', paths: [] }, { status: 'error', paths: [], message: 'Missing view' }] as (BaseResult | undefined)[]) {
		assert.deepEqual(selectNotes(notes, folder(), unavailable), []);
	}
	const tree = buildTree([], [folder()], notes, {}, new Map([[folder().id, { status: 'error', paths: [], message: 'Missing view' }]]));
	assert.ok(tree[0]?.type === 'folder');
	assert.equal(tree[0].message, 'Missing view');
	assert.equal(tree[0].count, 0);
});

void test('Base and rule folders intersect through nested organizational folders in either direction', () => {
	const rules = folder({ id: 'custom:rules', source: 'rules', sort: 'title', rules: [{ field: 'tag', operator: 'is', property: '', value: 'work', negate: false }] });
	const group = folder({ id: 'custom:group', kind: 'group', parentId: rules.id });
	const base = folder({ parentId: group.id });
	const results = new Map([[base.id, result]]);
	let tree = buildTree([], [rules, group, base], notes, {}, results);
	const child = tree[0]?.children[0]?.children[0];
	assert.deepEqual(child?.children.map((entry) => entry.id), [`${base.id}:${notes[1]!.path}`, `${base.id}:${notes[0]!.path}`]);
	base.parentId = null; rules.parentId = group.id; group.parentId = base.id;
	tree = buildTree([], [base, group, rules], notes, {}, results);
	assert.deepEqual(tree[0]?.children[0]?.children[0]?.children.map((entry) => entry.name), ['Alpha 2', 'alpha 10']);
	const narrower = folder({ id: 'custom:narrow', parentId: base.id });
	results.set(narrower.id, { status: 'ready', paths: [notes[2]!.path] });
	results.set(base.id, { status: 'ready', paths: [notes[0]!.path, notes[1]!.path] });
	tree = buildTree([], [base, narrower], notes, {}, results);
	assert.equal(tree[0]?.children[0]?.children.length, 0);
});

void test('saved folders retain legacy sort directions and malformed Base references fail closed', () => {
	const old = { ...folder({ source: undefined, sort: 'modified', sortDirection: undefined }), base: undefined };
	const loaded = loadBookmarkData({ folders: [old] }).folders[0]!;
	assert.equal(loaded.source, 'rules'); assert.equal(loaded.sortDirection, 'desc');
	assert.deepEqual(paths(selectNotes(notes, loaded)), [notes[1]!.path, notes[2]!.path, notes[0]!.path]);
	const malformed = loadBookmarkData({ folders: [{ ...folder(), base: { path: 42, view: null } }] }).folders[0]!;
	assert.equal(malformed.source, 'base'); assert.deepEqual(malformed.base, { path: '', view: '' });
	assert.deepEqual(selectNotes(notes, malformed), []);
});

void test('Base file references follow file and folder renames at path boundaries', () => {
	const data = loadBookmarkData({ folders: [folder({ base: { path: 'Bases/Projects.base', view: 'Active projects' } }),
		folder({ id: 'custom:other', base: { path: 'Bases-old/Projects.base', view: 'Other' } })] });
	assert.equal(updateNotePaths(data, 'Bases', 'Views'), true);
	assert.equal(data.folders[0]!.base?.path, 'Views/Projects.base');
	assert.equal(data.folders[1]!.base?.path, 'Bases-old/Projects.base');
	assert.equal(updateNotePaths(data, 'Views/Projects.base', 'Views/Renamed.base'), true);
	assert.deepEqual(data.folders[0]!.base, { path: 'Views/Renamed.base', view: 'Active projects' });
});

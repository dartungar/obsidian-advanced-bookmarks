import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { defaultData, descendantIds, loadBookmarkData, updateNotePaths } from '../src/model/data';
import { matchesFolder, ruleError, selectNotes } from '../src/model/rules';
import { buildTree, filterTree } from '../src/model/tree';
import { coreGroups, parseBookmarks } from '../src/bookmarks/parse';
import { noteBasename, vaultDirectory } from '../src/model/paths';
import type { BookmarkFolder, NoteDescriptor, Rule } from '../src/types';

const note: NoteDescriptor = { path: 'Projects/Alpha/Plan.md', name: 'Plan', mtime: 42, ctime: 20,
	tags: ['#project/alpha', '#work'], properties: { status: 'Active', effort: 3, done: false, owners: ['Ada', 'Lin'], empty: '' } };
const rule = (field: Rule['field'], value: string, operator: Rule['operator'] = 'is', negate = false, property = ''): Rule => ({ field, value, operator, negate, property });
const folder = (rules: Rule[], overrides: Partial<BookmarkFolder> = {}): BookmarkFolder => ({ id: 'custom:a', name: 'Projects',
	kind: 'dynamic', parentId: null, match: 'all', sort: 'name', rules, ...overrides });

void test('tags match exactly or at a nested tag boundary, ignoring case and optional hash', () => {
	assert.equal(matchesFolder(note, folder([rule('tag', '#PROJECT/alpha')])), true);
	assert.equal(matchesFolder(note, folder([rule('tag', 'project')])), false);
	assert.equal(matchesFolder(note, folder([rule('tag', 'project', 'contains')])), true);
	assert.equal(matchesFolder(note, folder([rule('tag', 'proj', 'contains')])), false);
});

void test('folder rules respect path boundaries, case, direct children, and vault root', () => {
	assert.equal(matchesFolder(note, folder([rule('folder', '/Projects/Alpha/')])), true);
	assert.equal(matchesFolder(note, folder([rule('folder', 'Projects')])), false);
	assert.equal(matchesFolder(note, folder([rule('folder', 'Projects', 'contains')])), true);
	assert.equal(matchesFolder(note, folder([rule('folder', 'Project', 'contains')])), false);
	assert.equal(matchesFolder(note, folder([rule('folder', 'projects', 'contains')])), false);
	assert.equal(matchesFolder(note, folder([rule('folder', '', 'contains')])), true);
	assert.equal(matchesFolder(note, folder([rule('folder', '')])), false);
	assert.equal(matchesFolder({ ...note, path: 'Plan.md' }, folder([rule('folder', '')])), true);
});

void test('property rules handle scalar types, lists, missing values, and falsy values', () => {
	for (const [key, value] of [['status', 'active'], ['effort', '3'], ['done', 'false'], ['owners', 'ada']]) {
		assert.equal(matchesFolder(note, folder([rule('property', value ?? '', 'is', false, key)])), true);
	}
	assert.equal(matchesFolder(note, folder([rule('property', 'ad', 'contains', false, 'owners')])), true);
	assert.equal(matchesFolder(note, folder([rule('property', '', 'exists', false, 'done')])), true);
	assert.equal(matchesFolder(note, folder([rule('property', '', 'exists', false, 'empty')])), true);
	assert.equal(matchesFolder(note, folder([rule('property', '', 'exists', false, 'missing')])), false);
	assert.equal(matchesFolder(note, folder([rule('property', 'anything', 'is', true, 'missing')])), true);
	assert.equal(matchesFolder({ ...note, properties: {} }, folder([rule('property', 'toString', 'is', false, 'toString')])), false);
});

void test('all/any matching combines positive rules; exclusions always remove a match', () => {
	const rules = [rule('tag', 'work'), rule('name', 'other')];
	assert.equal(matchesFolder(note, folder(rules)), false);
	assert.equal(matchesFolder(note, folder(rules, { match: 'any' })), true);
	assert.equal(matchesFolder(note, folder([...rules, rule('tag', 'work', 'is', true)], { match: 'any' })), false);
	assert.equal(matchesFolder(note, folder([rule('name', 'other', 'is', true)])), true);
});

void test('empty and malformed dynamic queries fail closed, including any-match queries', () => {
	assert.equal(matchesFolder(note, folder([])), false);
	assert.equal(matchesFolder(note, folder([rule('name', '')])), false);
	assert.equal(matchesFolder(note, folder([rule('tag', 'work'), rule('tag', '')], { match: 'any' })), false);
	assert.ok(ruleError(rule('tag', '', 'exists')));
	assert.ok(ruleError(rule('property', 'active')));
	assert.equal(matchesFolder(note, folder([], { kind: 'group' })), true);
});

void test('sort order is deterministic for duplicate names and modification times', () => {
	const notes = [note, { ...note, path: 'Other/Plan.md', mtime: 100 }, { ...note, path: 'Projects/Z.md', name: 'Z' }];
	assert.deepEqual(selectNotes(notes, folder([rule('tag', 'work')])).map((entry) => entry.path), ['Other/Plan.md', note.path, 'Projects/Z.md']);
	assert.equal(selectNotes(notes, folder([rule('tag', 'work')], { sort: 'modified' }))[0]?.path, 'Other/Plan.md');
});

void test('nested folders inherit filters through organizational groups and hide only their own folder note', () => {
	const parent = folder([rule('tag', 'work')]);
	const group = folder([], { id: 'custom:b', kind: 'group', parentId: parent.id });
	const child = folder([rule('name', 'plan')], { id: 'custom:c', parentId: group.id });
	const notes = [note, { ...note, path: 'Other/Plan.md', tags: ['#personal'] }];
	const tree = buildTree([], [parent, group, child], notes, { [parent.id]: note.path });
	const root = tree[0];
	assert.equal(root?.type, 'folder');
	if (root?.type !== 'folder') throw new Error('Missing parent');
	assert.equal(root.count, 0);
	assert.equal(root.children[0]?.children[0]?.children.length, 1);
	assert.equal(root.children[0]?.children[0]?.children[0]?.name, 'Plan');
});

void test('built-in group ordering, every bookmark type, and stable group IDs survive renames and moves', () => {
	const raw = [{ type: 'group', title: 'Work', ctime: 1, items: [{ type: 'file', path: 'Plan.md', subpath: '#Heading', ctime: 2 },
		{ type: 'search', query: 'tag:#work', ctime: 3 }, { type: 'graph', options: { search: 'tag:#work' }, ctime: 4 },
		{ type: 'url', url: 'https://obsidian.md', ctime: 5 }, { type: 'future', ctime: 6 }] }];
	const core = parseBookmarks(raw);
	assert.equal(core[0]?.items.length, 5);
	assert.equal(core[0]?.items[0]?.subpath, '#Heading');
	assert.notEqual(core[0]?.items[2]?.original.options, undefined);
	assert.equal(parseBookmarks([{ ...raw[0], title: 'Renamed' }])[0]?.id, core[0]?.id);
	assert.equal(parseBookmarks([{ type: 'group', title: 'Parent', ctime: 10, items: raw }])[0]?.items[0]?.id, core[0]?.id);
	assert.deepEqual(coreGroups(core), [{ id: 'core:group:1', name: 'Work' }]);
	const custom = folder([rule('tag', 'work')], { parentId: 'core:group:1' });
	assert.equal(buildTree(core, [custom], [note], {})[0]?.children.at(-1)?.id, custom.id);
	assert.equal(buildTree([], [custom], [note], {})[0]?.type, 'folder');
	const orphan = buildTree([], [custom], [note], {})[0];
	assert.equal(orphan?.type === 'folder' && orphan.orphan, true);
});

void test('bookmarked vault folders show notes recursively without prefix collisions', () => {
	const core = parseBookmarks([{ type: 'folder', path: 'Projects', ctime: 1 }]);
	const tree = buildTree(core, [], [note, { ...note, path: 'Projects-old/Plan.md' }], {});
	assert.equal(tree[0]?.children.length, 1);
});

void test('filter retains ancestor folders and matches note paths; matching a folder keeps its children', () => {
	const tree = buildTree([], [folder([rule('tag', 'work')])], [note], {});
	assert.equal(filterTree(tree, 'ALPHA')[0]?.children.length, 1);
	assert.equal(filterTree(tree, 'Projects')[0]?.children.length, 1);
	assert.equal(filterTree(tree, 'missing').length, 0);
});

void test('loading validates data, repairs cycles/missing custom parents, and rejects future schemas', () => {
	assert.deepEqual(loadBookmarkData(null), defaultData());
	const a = folder([rule('tag', 'work')], { parentId: 'custom:b' });
	const b = folder([], { id: 'custom:b', kind: 'group', parentId: a.id });
	const data = loadBookmarkData({ version: 1, folders: [a, b, a, { ...a, id: 'bad' }], settings: { showCounts: false } });
	assert.equal(data.folders.length, 2);
	assert.equal(data.folders[0]?.parentId, null);
	assert.equal(data.settings.showCounts, false);
	assert.throws(() => loadBookmarkData({ version: 2 }));
	const malformed = loadBookmarkData({ folders: [{ ...a, parentId: 'custom:missing', rules: [rule('tag', 'work'), {}], match: 'any' }] });
	assert.equal(malformed.folders[0]?.parentId, null);
	const invalid = malformed.folders[0];
	assert.ok(invalid);
	assert.equal(matchesFolder(note, invalid), false);
});

void test('folder renames update linked note paths and folder rules at boundaries', () => {
	const data = defaultData();
	data.folderNotes = { a: 'Projects/Plan.md', b: 'Projects-old/Plan.md' };
	data.folders = [folder([rule('folder', '/Projects/Alpha/'), rule('folder', 'Projects-old')])];
	assert.equal(updateNotePaths(data, 'Projects', 'Work'), true);
	assert.equal(data.folderNotes.a, 'Work/Plan.md');
	assert.equal(data.folderNotes.b, 'Projects-old/Plan.md');
	assert.equal(data.folders[0]?.rules[0]?.value, 'Work/Alpha');
	assert.equal(data.folders[0]?.rules[1]?.value, 'Projects-old');
	assert.equal(updateNotePaths(data, 'missing', 'new'), false);
});

void test('deleting a folder can identify its whole subtree without touching its siblings', () => {
	const a = folder([]);
	const b = folder([], { id: 'custom:b', parentId: a.id });
	const c = folder([], { id: 'custom:c', parentId: b.id });
	const sibling = folder([], { id: 'custom:d' });
	assert.deepEqual([...descendantIds([a, b, c, sibling], a.id)], [a.id, b.id, c.id]);
});

void test('folder note paths stay inside the vault and names cannot introduce subfolders', () => {
	assert.equal(vaultDirectory(''), '');
	assert.equal(vaultDirectory('Bookmark notes//Projects/'), 'Bookmark notes/Projects');
	assert.equal(vaultDirectory('Bookmark notes\\Projects'), 'Bookmark notes/Projects');
	for (const path of ['../outside', 'Notes/../../outside', '/absolute', 'C:\\outside', 'Notes/./Test']) {
		assert.equal(vaultDirectory(path), null);
	}
	assert.equal(noteBasename('Project/Alpha: overview'), 'Project-Alpha- overview');
	assert.equal(noteBasename('..'), 'Bookmark folder');
	assert.equal(noteBasename('Title\nOther'), 'Title-Other');
});

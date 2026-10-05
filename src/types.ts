export type RuleField = 'tag' | 'folder' | 'name' | 'property';
export type RuleOperator = 'is' | 'contains' | 'exists';

export interface Rule {
	field: RuleField;
	operator: RuleOperator;
	value: string;
	property: string;
	negate: boolean;
}

export interface BookmarkFolder {
	id: string;
	name: string;
	kind: 'group' | 'dynamic';
	parentId: string | null;
	match: 'all' | 'any';
	rules: Rule[];
	source?: 'rules' | 'base';
	base?: BaseReference;
	sort: 'title' | 'name' | 'path' | 'created' | 'modified' | 'base' | 'manual';
	sortDirection?: 'asc' | 'desc';
	manualOrder?: string[];
}

export interface BaseReference { path: string; view: string }
export interface BaseResult { status: 'loading' | 'ready' | 'error'; paths: string[]; message?: string }

export interface BookmarkData {
	version: 1;
	folders: BookmarkFolder[];
	folderNotes: Record<string, string>;
	collapsed: string[];
	itemOrder: Record<string, string[]>;
	settings: {
		showCounts: boolean;
		showFileIcons: boolean;
		folderNoteDirectory: string;
	};
}

export interface CoreBookmark {
	id: string;
	type: string;
	title: string;
	path: string;
	subpath: string;
	query: string;
	url: string;
	items: CoreBookmark[];
	original: Record<string, unknown>;
}

export interface NoteDescriptor {
	path: string;
	name: string;
	mtime: number;
	ctime: number;
	tags: string[];
	properties: Record<string, unknown>;
}

export interface FolderChoice {
	id: string;
	name: string;
}

import type { BaseResult, BookmarkFolder, NoteDescriptor, Rule } from '../types';
import { sortNotes } from './sorting';

export const RULE_FIELDS = { tag: 'Tag', folder: 'Vault folder', name: 'Note name', property: 'Property' };
export const RULE_OPERATORS = { is: 'Is', contains: 'Contains', exists: 'Exists' };

function comparable(value: unknown): string | null {
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		return String(value).toLocaleLowerCase();
	}
	return null;
}

function matchesRule(note: NoteDescriptor, rule: Rule): boolean {
	const value = rule.value.trim().toLocaleLowerCase();
	switch (rule.field) {
		case 'tag': {
			const tag = value.replace(/^#/, '');
			return note.tags.some((entry) => {
				const normalized = entry.replace(/^#/, '').toLocaleLowerCase();
				return rule.operator === 'contains'
					? normalized === tag || normalized.startsWith(`${tag}/`)
					: normalized === tag;
			});
		}
		case 'folder': {
			const folder = rule.value.trim().replace(/^\/+|\/+$/g, '');
			const parent = note.path.includes('/') ? note.path.slice(0, note.path.lastIndexOf('/')) : '';
			return rule.operator === 'contains'
				? !folder || parent === folder || parent.startsWith(`${folder}/`)
				: parent === folder;
		}
		case 'name':
			return rule.operator === 'contains' ? note.name.toLocaleLowerCase().includes(value)
				: note.name.toLocaleLowerCase() === value;
		case 'property': {
			const exists = Object.prototype.hasOwnProperty.call(note.properties, rule.property.trim());
			if (rule.operator === 'exists') return exists;
			if (!exists) return false;
			const raw = note.properties[rule.property.trim()];
			const entries: unknown[] = Array.isArray(raw) ? raw as unknown[] : [raw];
			return entries.some((entry) => {
				const text = comparable(entry);
				return text !== null && (rule.operator === 'contains' ? text.includes(value) : text === value);
			});
		}
	}
}

export function ruleError(rule: Rule): string | null {
	if (rule.field !== 'property' && rule.operator === 'exists') return 'Exists is only available for properties.';
	if (rule.field === 'property' && !rule.property.trim()) return 'Enter a property name.';
	if (rule.operator !== 'exists' && rule.field !== 'folder' && !rule.value.trim()) return 'Enter a rule value.';
	return null;
}

export function matchesFolder(note: NoteDescriptor, folder: BookmarkFolder): boolean {
	if (folder.kind === 'group') return true;
	if (folder.source === 'base') return false;
	// Empty or invalid queries fail closed instead of accidentally selecting the vault.
	if (!folder.rules.length || folder.rules.some((rule) => ruleError(rule))) return false;
	if (folder.rules.some((rule) => rule.negate && matchesRule(note, rule))) return false;
	const results = folder.rules.filter((rule) => !rule.negate).map((rule) => matchesRule(note, rule));
	return !results.length || (folder.match === 'all' ? results.every(Boolean) : results.some(Boolean));
}

export function selectNotes(notes: NoteDescriptor[], folder: BookmarkFolder, base?: BaseResult): NoteDescriptor[] {
	if (folder.source === 'base') {
		if (base?.status !== 'ready') return [];
		const candidates = new Map(notes.map((note) => [note.path, note]));
		const seen = new Set<string>();
		const matches: NoteDescriptor[] = [];
		for (const path of base.paths) {
			const note = candidates.get(path);
			if (note && !seen.has(path)) { seen.add(path); matches.push(note); }
		}
		return sortNotes(matches, folder);
	}
	return sortNotes(notes.filter((note) => matchesFolder(note, folder)), folder);
}

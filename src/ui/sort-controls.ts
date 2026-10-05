import { Setting } from 'obsidian';
import type { BookmarkFolder } from '../types';
import { SORT_FIELDS, sortDirection } from '../model/sorting';

export function renderSortControls(container: HTMLElement, folder: BookmarkFolder, changed: () => void): void {
	const setting = new Setting(container).setName('Sort notes').addDropdown((dropdown) => {
		for (const [value, label] of Object.entries(SORT_FIELDS)) if (value !== 'base' || folder.source === 'base') dropdown.addOption(value, label);
		dropdown.setValue(folder.sort).onChange((value) => { folder.sort = value as BookmarkFolder['sort']; update(); changed(); });
	});
	const direction = new Setting(container).setName('Sort direction').addDropdown((dropdown) => dropdown
		.addOption('asc', 'Ascending').addOption('desc', 'Descending').setValue(sortDirection(folder))
		.onChange((value) => { folder.sortDirection = value === 'desc' ? 'desc' : 'asc'; changed(); }));
	const update = () => {
		direction.settingEl.hidden = folder.sort === 'manual';
		setting.setDesc(folder.sort === 'manual' ? 'Drag notes in the sidebar to set their order. New matches appear at the end.' : '');
	};
	update();
}

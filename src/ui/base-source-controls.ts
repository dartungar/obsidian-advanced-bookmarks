import { Setting } from 'obsidian';
import { baseViewNames } from '../bases/native';
import type { BookmarkController } from '../services/controller';
import type { BookmarkFolder } from '../types';

export class BaseSourceControls {
	private request = 0;
	private closed = false;
	private viewsEl!: HTMLElement;
	constructor(private controller: BookmarkController, private folder: BookmarkFolder,
		private container: HTMLElement, private changed: () => void) {}
	cancel(): void { this.closed = true; this.request++; }

	render(): void {
		const reference = this.folder.base ??= { path: '', view: '' };
		new Setting(this.container).setName('Base file').addDropdown((dropdown) => {
			dropdown.addOption('', 'Select a base');
			const files = this.controller.app.vault.getFiles().filter((file) => file.extension === 'base').sort((a, b) => a.path.localeCompare(b.path));
			for (const file of files) dropdown.addOption(file.path, file.path);
			if (reference.path && !files.some((file) => file.path === reference.path)) dropdown.addOption(reference.path, `Missing: ${reference.path}`);
			dropdown.setValue(reference.path).onChange((path) => {
				this.folder.base = { path, view: '' }; void this.loadViews(); this.changed();
			});
		});
		this.viewsEl = this.container.createDiv();
		this.container.createEl('p', { cls: 'ab-help', text: 'Uses the selected base view’s filters, formulas, and limit. Parent folder filters still apply. Requires the core plugin for bases and native base queries in Obsidian.' });
		void this.loadViews();
	}

	private async loadViews(): Promise<void> {
		const request = ++this.request;
		const reference = this.folder.base;
		this.viewsEl.empty();
		if (!reference?.path) return;
		this.viewsEl.setText('Loading views…');
		try {
			const names = await baseViewNames(this.controller.app, reference.path);
			if (this.closed || request !== this.request) return;
			this.viewsEl.empty();
			new Setting(this.viewsEl).setName('Base view').addDropdown((dropdown) => {
				dropdown.addOption('', 'Select a view');
				for (const name of new Set(names)) dropdown.addOption(name, name);
				if (reference.view && !names.includes(reference.view)) dropdown.addOption(reference.view, `Missing: ${reference.view}`);
				dropdown.setValue(reference.view).onChange((view) => { reference.view = view; this.changed(); });
			});
		} catch (error) {
			if (!this.closed && request === this.request) this.viewsEl.setText(error instanceof Error ? error.message : 'Could not load base views.');
		}
	}
}

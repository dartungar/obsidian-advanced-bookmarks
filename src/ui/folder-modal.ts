import { ButtonComponent, Modal, Setting } from 'obsidian';
import type { BookmarkController } from '../services/controller';
import type { BookmarkFolder, Rule } from '../types';
import { selectNotes, ruleError, RULE_FIELDS, RULE_OPERATORS } from '../model/rules';
import { noteTitle } from '../model/sorting';
import { BaseSourceControls } from './base-source-controls';
import { renderSortControls } from './sort-controls';

export class FolderModal extends Modal {
	private draft: BookmarkFolder;
	private preview!: HTMLElement;
	private rulesEl!: HTMLElement;
	private sourceEl!: HTMLElement;
	private sourceControls: BaseSourceControls | null = null;
	private unsubscribe: (() => void) | null = null;

	constructor(private controller: BookmarkController, folder?: BookmarkFolder, parentId: string | null = null, kind: BookmarkFolder['kind'] = 'dynamic') {
		super(controller.app);
		this.draft = folder ? JSON.parse(JSON.stringify(folder)) as BookmarkFolder : {
			id: `custom:${Date.now()}:${Math.random().toString(36).slice(2)}`, name: '', kind, parentId,
			match: 'all', rules: [{ field: 'tag', operator: 'is', value: '', property: '', negate: false }], source: 'rules', sort: 'title', sortDirection: 'asc',
		};
		this.setTitle(folder ? 'Edit bookmark folder' : kind === 'dynamic' ? 'New dynamic folder' : 'New bookmark folder');
	}

	onOpen(): void {
		const { contentEl } = this;
		this.modalEl.addClass('ab-folder-modal');
		new Setting(contentEl).setName('Name').addText((text) => text.setValue(this.draft.name)
			.setPlaceholder('Project notes').onChange((value) => { this.draft.name = value; }));
		new Setting(contentEl).setName('Parent folder').setDesc('Nested dynamic folders narrow their parent’s results.')
			.addDropdown((dropdown) => {
				dropdown.addOption('', 'Top level');
				for (const choice of this.controller.choices(this.draft.id)) dropdown.addOption(choice.id, choice.name);
				if (this.draft.parentId && !this.controller.choices(this.draft.id).some((choice) => choice.id === this.draft.parentId)) {
					dropdown.addOption(this.draft.parentId, 'Missing parent (select a new parent)');
				}
				dropdown.setValue(this.draft.parentId ?? '').onChange((value) => { this.draft.parentId = value || null; this.updatePreview(); });
			});
		if (this.draft.kind === 'dynamic') {
			new Setting(contentEl).setName('Notes from').addDropdown((dropdown) => dropdown
				.addOption('rules', 'Rules').addOption('base', 'Base view').setValue(this.draft.source ?? 'rules').onChange((value) => {
					this.draft.source = value === 'base' ? 'base' : 'rules';
					this.draft.sort = value === 'base' ? 'base' : 'title'; this.draft.sortDirection = 'asc';
					this.renderSource(); this.updatePreview();
				}));
			this.sourceEl = contentEl.createDiv();
			this.renderSource();
			this.preview = contentEl.createDiv({ cls: 'ab-preview', attr: { role: 'status' } });
			this.unsubscribe = this.controller.subscribe(() => this.updatePreview());
			this.updatePreview();
		}
		if (this.draft.kind === 'group') this.preview = contentEl.createDiv({ cls: 'ab-preview setting-item-description', attr: { role: 'status' } });
		const footer = contentEl.createDiv({ cls: 'modal-button-container' });
		new ButtonComponent(footer).setButtonText('Cancel').onClick(() => this.close());
		const button = new ButtonComponent(footer).setButtonText('Save folder').setCta().onClick(async () => {
				const error = !this.draft.name.trim() ? 'Enter a folder name.' : this.draft.kind === 'dynamic'
					? this.draft.source === 'base' ? !this.draft.base?.path || !this.draft.base.view ? 'Select a base file and a view.' : null
						: this.draft.rules.map(ruleError).find(Boolean) ?? (!this.draft.rules.length ? 'Add at least one rule.' : null) : null;
				if (error) { this.preview.setText(error); return; }
				button.setDisabled(true);
				this.draft.name = this.draft.name.trim();
				if (await this.controller.saveFolder(this.draft)) this.close();
				else button.setDisabled(false);
			});
	}

	private renderSource(): void {
		this.sourceControls?.cancel(); this.sourceControls = null;
		this.sourceEl.empty();
		if (this.draft.source === 'base') {
			this.sourceControls = new BaseSourceControls(this.controller, this.draft, this.sourceEl, () => this.updatePreview());
			this.sourceControls.render();
		} else this.renderQuery();
		renderSortControls(this.sourceEl, this.draft, () => this.updatePreview());
	}

	private renderQuery(): void {
		new Setting(this.sourceEl).setName('Match rules').addDropdown((dropdown) => dropdown
			.addOption('all', 'All rules').addOption('any', 'Any rule').setValue(this.draft.match)
			.onChange((value) => { this.draft.match = value === 'any' ? 'any' : 'all'; this.updatePreview(); }));
		this.sourceEl.createEl('p', { cls: 'setting-item-description', text: 'Tag “contains” includes nested tags. Folder “contains” includes subfolders; an empty folder value means the vault root.' });
		this.rulesEl = this.sourceEl.createDiv();
		this.renderRules();
		new Setting(this.sourceEl).addButton((button) => button.setButtonText('Add rule').onClick(() => {
			this.draft.rules.push({ field: 'tag', operator: 'is', value: '', property: '', negate: false });
			this.renderRules(); this.updatePreview();
		}));
	}

	private renderRules(): void {
		this.rulesEl.empty();
		this.draft.rules.forEach((rule, index) => {
			const row = this.rulesEl.createDiv({ cls: 'ab-rule' });
			new Setting(row).setName(`Rule ${index + 1}`).addDropdown((dropdown) => {
				for (const [key, label] of Object.entries(RULE_FIELDS)) dropdown.addOption(key, label);
				dropdown.setValue(rule.field).onChange((value) => {
					rule.field = value as Rule['field'];
					if (rule.field !== 'property' && rule.operator === 'exists') rule.operator = 'is';
					this.renderRules(); this.updatePreview();
				});
			}).addDropdown((dropdown) => {
				for (const [key, label] of Object.entries(RULE_OPERATORS)) if (key !== 'exists' || rule.field === 'property') dropdown.addOption(key, label);
				dropdown.setValue(rule.operator).onChange((value) => {
					rule.operator = value as Rule['operator']; this.renderRules(); this.updatePreview();
				});
			}).addExtraButton((button) => button.setIcon('trash-2').setTooltip('Remove rule').onClick(() => {
				this.draft.rules.splice(index, 1); this.renderRules(); this.updatePreview();
			}));
			if (rule.field === 'property') new Setting(row).setName('Property name').addText((text) => text
				.setPlaceholder('Status').setValue(rule.property).onChange((value) => { rule.property = value; this.updatePreview(); }));
			if (rule.operator !== 'exists') new Setting(row).setName('Value').addText((text) => text.setValue(rule.value)
				.setPlaceholder(rule.field === 'tag' ? '#project' : rule.field === 'folder' ? 'Projects' : 'Value')
				.onChange((value) => { rule.value = value; this.updatePreview(); }));
			new Setting(row).setName('Exclude matches').addToggle((toggle) => toggle.setValue(rule.negate)
				.onChange((value) => { rule.negate = value; this.updatePreview(); }));
		});
	}

	private updatePreview(): void {
		if (!this.preview || this.draft.kind !== 'dynamic') return;
		const error = this.draft.source === 'base' ? null : this.draft.rules.map(ruleError).find(Boolean);
		if (error) { this.preview.setText(error); return; }
		const ancestors: BookmarkFolder[] = [];
		const seen = new Set([this.draft.id]);
		let id = this.draft.parentId;
		while (id && !seen.has(id)) {
			seen.add(id);
			const parent = this.controller.data.folders.find((folder) => folder.id === id);
			if (!parent) break;
			ancestors.push(parent); id = parent.parentId;
		}
		const chain = [...ancestors.reverse(), this.draft];
		const bases = this.controller.bases.results(chain);
		const unavailable = [...bases.values()].find((result) => result.status !== 'ready');
		if (unavailable) { this.preview.setText(unavailable.message ?? 'Loading base view…'); return; }
		let notes = this.controller.notes.get();
		for (const folder of chain) if (folder.kind === 'dynamic') notes = selectNotes(notes, folder, bases.get(folder.id));
		notes = notes.filter((note) => note.path !== this.controller.data.folderNotes[this.draft.id]);
		this.preview.setText(`${notes.length} matching notes${notes.length ? ` · ${notes.slice(0, 3).map(noteTitle).join(', ')}${notes.length > 3 ? ', …' : ''}` : ''}`);
	}

	onClose(): void { this.sourceControls?.cancel(); this.unsubscribe?.(); this.unsubscribe = null; this.contentEl.empty(); }
}

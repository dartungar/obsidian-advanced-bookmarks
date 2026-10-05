import { App, FuzzySuggestModal, TFile } from 'obsidian';

export class NotePicker extends FuzzySuggestModal<TFile> {
	constructor(app: App, private select: (file: TFile) => void) {
		super(app);
		this.setPlaceholder('Select a note for this bookmark folder');
	}
	getItems(): TFile[] { return this.app.vault.getMarkdownFiles(); }
	getItemText(file: TFile): string { return file.path; }
	onChooseItem(file: TFile): void { this.select(file); }
}

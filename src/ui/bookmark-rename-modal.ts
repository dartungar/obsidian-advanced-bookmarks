import { App, ButtonComponent, Modal, Setting } from 'obsidian';

export class BookmarkRenameModal extends Modal {
	constructor(app: App, private title: string, private save: (title: string) => Promise<boolean>) {
		super(app); this.setTitle('Rename bookmark');
	}
	onOpen(): void {
		let input!: HTMLInputElement;
		new Setting(this.contentEl).setName('Name').addText((text) => {
			text.setValue(this.title).onChange((value) => { this.title = value; }); input = text.inputEl;
		});
		const footer = this.contentEl.createDiv({ cls: 'modal-button-container' });
		new ButtonComponent(footer).setButtonText('Cancel').onClick(() => this.close());
		const button = new ButtonComponent(footer).setButtonText('Save').setCta().onClick(async () => {
			if (!this.title.trim()) { input.focus(); return; }
			button.setDisabled(true);
			if (await this.save(this.title)) this.close(); else button.setDisabled(false);
		});
		input.focus(); input.select();
	}
	onClose(): void { this.contentEl.empty(); }
}

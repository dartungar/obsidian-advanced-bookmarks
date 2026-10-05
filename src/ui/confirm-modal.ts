import { App, Modal, Setting } from 'obsidian';

export class ConfirmModal extends Modal {
	constructor(app: App, private name: string, private remove: () => Promise<void>) { super(app); }
	onOpen(): void {
		this.setTitle(`Delete ${this.name}?`);
		this.contentEl.createEl('p', { text: 'This removes the folder and its nested custom folders. Vault notes and built-in bookmarks are kept.' });
		new Setting(this.contentEl).addButton((button) => button.setButtonText('Cancel').onClick(() => this.close()))
			.addButton((button) => button.setButtonText('Delete folder').setWarning().onClick(async () => {
				button.setDisabled(true);
				await this.remove();
				this.close();
			}));
	}
	onClose(): void { this.contentEl.empty(); }
}

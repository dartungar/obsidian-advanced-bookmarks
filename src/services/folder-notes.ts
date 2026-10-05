import { Notice, TFile } from 'obsidian';
import type { BookmarkController } from './controller';
import { NotePicker } from '../ui/note-picker';
import { noteBasename, vaultDirectory } from '../model/paths';

export class FolderNotes {
	constructor(private controller: BookmarkController) {}

	link(id: string): void {
		new NotePicker(this.controller.app, (file) => {
			this.controller.data.folderNotes[id] = file.path;
			void this.controller.save();
		}).open();
	}

	async unlink(id: string): Promise<void> {
		delete this.controller.data.folderNotes[id];
		await this.controller.save();
	}

	async open(id: string, newTab = false): Promise<void> {
		const path = this.controller.data.folderNotes[id];
		const file = path ? this.controller.app.vault.getFileByPath(path) : null;
		if (!file) { new Notice('This folder note is missing. Link another note from the folder menu.'); return; }
		try { await this.controller.app.workspace.getLeaf(newTab ? 'tab' : false).openFile(file); }
		catch { new Notice('Could not open the folder note.'); }
	}

	async create(id: string, name: string): Promise<void> {
		if (this.controller.data.folderNotes[id]) { await this.open(id); return; }
		const { vault } = this.controller.app;
		const directory = vaultDirectory(this.controller.data.settings.folderNoteDirectory);
		if (directory === null) {
			new Notice('Choose a folder inside the vault in the plugin settings.'); return;
		}
		const basename = noteBasename(name);
		try {
			if (directory && directory !== '/') {
				let partial = '';
				for (const segment of directory.split('/')) {
					partial = partial ? `${partial}/${segment}` : segment;
					if (!vault.getAbstractFileByPath(partial)) await vault.createFolder(partial);
				}
			}
			const prefix = directory && directory !== '/' ? `${directory}/` : '';
			let path = `${prefix}${basename}.md`;
			let suffix = 1;
			while (vault.getAbstractFileByPath(path)) path = `${prefix}${basename} ${suffix++}.md`;
			const heading = name.replace(/[\r\n]/g, ' ');
			const file: TFile = await vault.create(path, `# ${heading}\n\n`);
			this.controller.data.folderNotes[id] = file.path;
			await this.controller.save();
			await this.open(id);
		} catch { new Notice('Could not create the folder note. Check the folder path and vault storage.'); }
	}
}

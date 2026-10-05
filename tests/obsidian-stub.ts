// Runtime doubles for service contracts; the shipped plugin still imports real Obsidian.
export class Component {
	private children: Component[] = [];
	private cleanup: (() => void)[] = [];
	private loaded = false;
	load(): void {
		if (this.loaded) return;
		this.loaded = true; this.onload();
		for (const child of this.children) child.load();
	}
	unload(): void {
		if (!this.loaded) return;
		this.loaded = false; this.onunload();
		for (const cleanup of this.cleanup.splice(0)) cleanup();
		for (const child of this.children) child.unload();
	}
	onload(): void {}
	onunload(): void {}
	addChild<T extends Component>(child: T): T {
		this.children.push(child);
		if (this.loaded) child.load();
		return child;
	}
	register(cleanup: () => void): void { this.cleanup.push(cleanup); }
	registerEvent(event: { off: () => void }): void { this.register(event.off); }
}

export class Notice {
	static messages: string[] = [];
	constructor(message: string) { Notice.messages.push(message); }
}

export function getAllTags(metadata: { tags?: { tag: string }[] }): string[] {
	return metadata.tags?.map((item) => item.tag) ?? [];
}

// Base adapter fixtures use JSON, a valid YAML subset; Obsidian parses YAML in production.
export function parseYaml(source: string): unknown { return JSON.parse(source) as unknown; }

export class Modal {
	static opened: Modal[] = [];
	constructor(readonly app: unknown) {}
	setTitle(_title: string): void {}
	open(): void { Modal.opened.push(this); }
}

export class Menu {
	static shown: Menu[] = [];
	items: MenuItem[] = [];
	addItem(callback: (item: MenuItem) => void): this { const item = new MenuItem(); callback(item); this.items.push(item); return this; }
	addSeparator(): this { return this; }
	showAtMouseEvent(_event: unknown): void { Menu.shown.push(this); }
}
export class MenuItem {
	title = ''; disabled = false; callback: (() => unknown) | null = null;
	setTitle(title: string): this { this.title = title; return this; }
	setIcon(_icon: string): this { return this; }
	setDisabled(value: boolean): this { this.disabled = value; return this; }
	onClick(callback: () => unknown): this { this.callback = callback; return this; }
}

export const Platform = { isMobile: false };
export class ButtonComponent {}
export class Setting {}

export class PluginSettingTab {
	constructor(readonly app: unknown, _plugin: unknown) {}
}

export class FuzzySuggestModal<T> {
	constructor(readonly app: unknown) {}
	setPlaceholder(_placeholder: string): void {}
	open(): void {}
	getItems(): T[] { return []; }
}

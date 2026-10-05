import { App, Component, Events, Menu, WorkspaceLeaf } from 'obsidian';
import { record } from '../model/data';
import type { CoreBookmarks } from './core';
import { BookmarkRenameModal } from '../ui/bookmark-rename-modal';

type NativeView = Component & { plugin: unknown; containerEl: HTMLElement; getItemDom: (item: unknown) => unknown; createNewGroup?: (parent: unknown) => void };

/** Reuse core's menu builder and edit dialog without changing its pane or selection. */
export class CoreBookmarkMenus extends Component {
	private detached: NativeView | null = null;
	constructor(private app: App, private core: CoreBookmarks) { super(); }

	onunload(): void { this.dispose(); }
	private dispose(): void {
		this.detached?.unload(); this.detached?.containerEl.remove(); this.detached = null;
	}
	private view(plugin: unknown, leaf: WorkspaceLeaf): NativeView | null {
		for (const entry of this.app.workspace.getLeavesOfType('bookmarks')) {
			const view = entry.view as unknown as NativeView;
			if (view.plugin === plugin && typeof view.getItemDom === 'function') return view;
		}
		if (this.detached?.plugin !== plugin) this.dispose();
		if (!this.detached) {
			const registry = record((this.app as unknown as { viewRegistry?: unknown }).viewRegistry);
			if (typeof registry?.getViewCreatorByType !== 'function') return null;
			const factory = (registry.getViewCreatorByType as (type: string) => unknown).call(registry, 'bookmarks');
			if (typeof factory !== 'function') return null;
			// Construct offscreen; never load it, attach a workspace leaf, or subscribe to core events.
			this.detached = (factory as (leaf: WorkspaceLeaf) => NativeView)(leaf);
		}
		return this.detached?.plugin === plugin && typeof this.detached.getItemDom === 'function' ? this.detached : null;
	}

	show(id: string, row: HTMLElement, leaf: WorkspaceLeaf, event: MouseEvent, extend?: (menu: Menu) => void): boolean {
		const target = this.core.menuTarget(id);
		if (!target) return false;
		let subscription: ReturnType<Events['on']> | undefined;
		try {
			const view = this.view(target.plugin, leaf);
			if (!view) return false;
			const nativeRow = record(view.getItemDom(target.bookmark.original));
			if (typeof nativeRow?.onContextMenu !== 'function') return false;
			const rename = (item: Record<string, unknown>) => {
				const title = typeof target.plugin.getItemTitle === 'function'
					? (target.plugin.getItemTitle as (item: unknown) => string).call(target.plugin, item) : typeof item.title === 'string' ? item.title : '';
				new BookmarkRenameModal(this.app, title, (value) => this.core.rename(item, value)).open();
			};
			const facade = {
				item: target.bookmark.original, selfEl: row, startRename: () => rename(target.bookmark.original),
				view: { app: this.app, plugin: target.plugin, tree: { selectedDoms: new Set() }, createNewGroup: (parent: unknown) => {
					if (typeof view.createNewGroup !== 'function') return;
					view.createNewGroup.call({ plugin: target.plugin, update: () => { void this.core.refresh(); },
						getItemDom: (item: Record<string, unknown>) => ({ startRename: () => rename(item) }) }, parent);
				} },
			};
			if (extend) subscription = (this.app.workspace as Events).on('bookmarks:bookmarks-menu', (menu, items) => {
				if (menu instanceof Menu && Array.isArray(items) && items.length === 1 && items[0] === target.bookmark.original) extend(menu);
			});
			(nativeRow.onContextMenu as (event: MouseEvent) => void).call(facade, event);
			return true;
		} catch { return false; }
		finally { if (subscription) this.app.workspace.offref(subscription); }
	}
}

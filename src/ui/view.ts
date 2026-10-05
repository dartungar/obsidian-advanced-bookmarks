import { Component, ItemView, Notice, setIcon, WorkspaceLeaf } from 'obsidian';
import type { BookmarkController } from '../services/controller';
import { FolderNotes } from '../services/folder-notes';
import { buildTree, filterTree, TreeNode } from '../model/tree';
import { FolderModal } from './folder-modal';
import { TreeMenu } from './tree-menu';
import { TreeDrag } from './tree-drag';
import { collapsibleIds, setCollapsedIds } from '../model/collapse';

export const VIEW_TYPE = 'advanced-bookmarks';

export class AdvancedBookmarksView extends ItemView {
	private treeEl!: HTMLElement;
	private statusEl!: HTMLElement;
	private query = '';
	private filteredCollapsed = new Set<string>();
	private renderScope: Component | null = null;
	private limits = new Map<string, number>();
	private folderNotes: FolderNotes;
	private viewScope: Component | null = null;
	private tree: TreeNode[] = [];
	private drag: TreeDrag;
	private collapseButton!: HTMLElement;
	private menu!: TreeMenu;

	constructor(leaf: WorkspaceLeaf, private controller: BookmarkController) {
		super(leaf);
		this.folderNotes = new FolderNotes(controller);
		this.drag = new TreeDrag(controller, () => this.tree, () => Boolean(this.query.trim()), () => this.render());
	}
	getViewType(): string { return VIEW_TYPE; }
	getDisplayText(): string { return 'Advanced bookmarks'; }
	getIcon(): string { return 'bookmark-check'; }

	onOpen(): Promise<void> {
		if (this.viewScope) this.removeChild(this.viewScope);
		const viewScope = this.viewScope = this.addChild(new Component());
		this.menu = viewScope.addChild(new TreeMenu(this.controller, this.leaf));
		this.contentEl.empty();
		this.contentEl.addClass('ab-view');
		const header = this.contentEl.createDiv({ cls: 'nav-header' });
		const toolbar = header.createDiv({ cls: 'nav-buttons-container' });
		this.iconButton(toolbar, 'bookmark-plus', 'Bookmark current tab', viewScope, () => { this.controller.core.bookmarkCurrentTab(); });
		this.iconButton(toolbar, 'folder-plus', 'New dynamic folder', viewScope, () => new FolderModal(this.controller).open());
		this.iconButton(toolbar, 'folder', 'New bookmark folder', viewScope, () => new FolderModal(this.controller, undefined, null, 'group').open());
		this.collapseButton = this.iconButton(toolbar, 'chevrons-down-up', 'Collapse all', viewScope, () => {
			const tree = filterTree(this.tree, this.query);
			const state = this.query ? this.filteredCollapsed : new Set(this.controller.data.collapsed);
			return this.setAllCollapsed(collapsibleIds(tree).some((id) => !state.has(id)));
		});
		this.iconButton(toolbar, 'refresh-cw', 'Refresh bookmarks', viewScope, async () => {
			this.controller.notes.invalidate(); this.controller.bases.invalidate(); await this.controller.core.refresh(); this.render();
		});
		const searchContainer = header.createDiv({ cls: 'search-input-container' });
		searchContainer.hidden = true;
		const search = searchContainer.createEl('input', { type: 'search', placeholder: 'Filter bookmarks…', attr: { 'aria-label': 'Filter bookmarks' } });
		this.iconButton(toolbar, 'search', 'Filter bookmarks', viewScope, () => {
			searchContainer.hidden = !searchContainer.hidden;
			if (!searchContainer.hidden) search.focus();
			else { search.value = ''; this.query = ''; this.filteredCollapsed.clear(); this.render(); }
		});
		viewScope.registerDomEvent(search, 'input', () => { this.query = search.value; this.filteredCollapsed.clear(); this.render(); });
		this.statusEl = this.contentEl.createDiv({ cls: 'ab-status', attr: { role: 'status' } });
		this.treeEl = this.contentEl.createDiv({ cls: 'ab-tree', attr: { 'aria-label': 'Bookmarks' } });
		viewScope.register(this.controller.subscribe(() => this.render()));
		viewScope.registerEvent(this.app.workspace.on('file-open', () => this.render()));
		this.render();
		return this.controller.core.refresh();
	}

	onClose(): Promise<void> {
		if (this.viewScope) this.removeChild(this.viewScope);
		this.viewScope = null;
		if (this.renderScope) this.removeChild(this.renderScope);
		this.renderScope = null;
		this.contentEl.empty();
		this.drag.end();
		return Promise.resolve();
	}

	private render(): void {
		// Obsidian can open a view before attaching its content to the workspace.
		if (!this.viewScope || !this.treeEl || this.drag.active) return;
		const focused = this.contentEl.doc.activeElement;
		const focusId = focused?.getAttribute('data-focus');
		const scroll = this.treeEl.scrollTop;
		if (this.renderScope) this.removeChild(this.renderScope);
		this.renderScope = this.addChild(new Component());
		this.treeEl.empty();
		this.statusEl.setText(this.controller.core.status);
		const { data, core, notes } = this.controller;
		const needsNotes = data.folders.some((folder) => folder.kind === 'dynamic') || this.hasVaultFolder(core.items);
		this.tree = buildTree(core.items, data.folders, needsNotes ? notes.get() : [], data.folderNotes,
			this.controller.bases.results(data.folders), data.itemOrder);
		const tree = filterTree(this.tree, this.query);
		const ids = collapsibleIds(tree);
		const state = this.query ? this.filteredCollapsed : new Set(data.collapsed);
		const collapse = ids.some((id) => !state.has(id));
		const label = collapse ? 'Collapse all' : 'Expand all';
		this.collapseButton.title = label; this.collapseButton.setAttribute('aria-label', label);
		this.collapseButton.setAttribute('aria-disabled', String(!ids.length));
		this.collapseButton.tabIndex = ids.length ? 0 : -1;
		setIcon(this.collapseButton, collapse ? 'chevrons-down-up' : 'chevrons-up-down');
		if (!tree.length) this.treeEl.createDiv({ cls: 'ab-empty', text: this.query ? 'No matching bookmarks.'
			: 'Create a dynamic folder or add bookmarks using the built-in Bookmarks plugin.' });
		this.renderNodes(tree, this.treeEl, this.renderScope);
		this.treeEl.scrollTop = scroll;
		if (focusId) this.treeEl.querySelectorAll<HTMLElement>('[data-focus]').forEach((element) => {
			if (element.getAttribute('data-focus') === focusId) element.focus();
		});
	}

	async setAllCollapsed(collapsed: boolean): Promise<void> {
		const tree = filterTree(this.tree, this.query);
		if (!collapsibleIds(tree).length) return;
		if (this.query) {
			this.filteredCollapsed = new Set(setCollapsedIds(tree, this.filteredCollapsed, collapsed)); this.render();
		} else {
			this.controller.data.collapsed = setCollapsedIds(tree, this.controller.data.collapsed, collapsed);
			this.render(); await this.controller.save();
		}
	}

	private renderNodes(nodes: TreeNode[], container: HTMLElement, scope: Component, parent: TreeNode | null = null): void {
		for (const node of nodes) {
			const group = node.type === 'folder' || (node.type === 'core' && ['group', 'folder'].includes(node.bookmark.type));
			const collapsed = this.query ? this.filteredCollapsed.has(node.id) : this.controller.data.collapsed.includes(node.id);
			const item = container.createDiv({ cls: `tree-item${collapsed ? ' is-collapsed' : ''}` });
			const row = item.createDiv({ cls: `tree-item-self is-clickable${group ? ' mod-collapsible' : ''}`, attr: { 'data-focus': node.id, role: 'button', tabindex: '0' } });
			if (group) {
				row.setAttribute('aria-expanded', String(!collapsed));
				setIcon(row.createSpan({ cls: `tree-item-icon collapse-icon${collapsed ? ' is-collapsed' : ''}` }), 'right-triangle');
			} else if (this.controller.data.settings.showFileIcons || (node.type === 'core' && node.bookmark.type !== 'file')) {
				setIcon(row.createSpan({ cls: 'tree-item-icon' }), this.nodeIcon(node));
			}
			row.createDiv({ cls: 'tree-item-inner', text: node.name });
			row.title = node.type === 'note' ? node.path : node.type === 'folder' && node.orphan
				? 'Parent bookmark group is missing. Edit this folder to select a new parent.' : node.name;
			if (node.type === 'folder' && node.folder.kind === 'dynamic' && this.controller.data.settings.showCounts) {
				row.createDiv({ cls: 'tree-item-flair-outer' }).createSpan({ cls: 'tree-item-flair', text: String(node.count) });
			}
			const path = node.type === 'note' ? node.path : node.type === 'core' && node.bookmark.type === 'file' && !node.bookmark.subpath ? node.bookmark.path : null;
			if (path && path === this.app.workspace.getActiveFile()?.path) row.addClass('is-active');
			const activate = (newTab: boolean) => {
				if (group) {
					if (this.query) {
						if (collapsed) this.filteredCollapsed.delete(node.id); else this.filteredCollapsed.add(node.id);
						this.render();
					} else {
						if (collapsed) this.controller.data.collapsed = this.controller.data.collapsed.filter((id) => id !== node.id);
						else this.controller.data.collapsed.push(node.id);
						this.render(); void this.controller.save();
					}
				} else void this.openNode(node, newTab);
			};
			scope.registerDomEvent(row, 'click', (event) => { if (!this.drag.active) activate(event.ctrlKey || event.metaKey); });
			scope.registerDomEvent(row, 'keydown', (event) => {
				if (event.target !== row || this.drag.keyboard(event, node, parent)) return;
				if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(event.ctrlKey || event.metaKey); }
				else if (group && ((event.key === 'ArrowRight' && collapsed) || (event.key === 'ArrowLeft' && !collapsed))) { event.preventDefault(); activate(false); }
			});
			this.drag.attach(row, node, parent, scope);
			scope.registerDomEvent(row, 'contextmenu', (event) => this.menu.show(node, row, event));
			if (group && !(node.type === 'core' && node.bookmark.type === 'folder')) {
				if (this.controller.data.folderNotes[node.id]) this.iconButton(row, 'file-text', 'Open folder note', scope,
					(event) => this.folderNotes.open(node.id, event.ctrlKey || event.metaKey), `${node.id}:note`);
				this.iconButton(row, 'more-horizontal', 'Folder menu', scope, (event) => this.menu.show(node, row, event), `${node.id}:menu`);
			}
			if (group && !collapsed) {
				const children = item.createDiv({ cls: 'tree-item-children' });
				const limit = this.limits.get(node.id) ?? 100;
				this.renderNodes(node.children.slice(0, limit), children, scope, node);
				if (node.children.length > limit) {
					const more = children.createEl('button', { cls: 'ab-load-more', text: `Show more (${node.children.length - limit} remaining)` });
					scope.registerDomEvent(more, 'click', () => { this.limits.set(node.id, limit + 100); this.render(); });
				}
				if (node.type === 'folder' && node.message) children.createDiv({ cls: 'ab-empty', text: node.message, attr: { role: 'status' } });
				else if (!node.children.length) children.createDiv({ cls: 'ab-empty', text: node.type === 'folder' && node.folder.kind === 'dynamic' ? 'No notes match this folder.' : 'This folder is empty.' });
			}
		}
	}

	private nodeIcon(node: TreeNode): string {
		if (node.type === 'note') return 'file-text';
		if (node.type === 'folder') return node.folder.kind === 'dynamic' ? 'folder-search' : 'folder';
		return ({ group: 'folder', folder: 'folder', search: 'search', graph: 'git-fork', url: 'link', file: 'file-text' } as Record<string, string>)[node.bookmark.type] ?? 'bookmark';
	}

	private hasVaultFolder(items: BookmarkController['core']['items']): boolean {
		return items.some((item) => item.type === 'folder' || this.hasVaultFolder(item.items));
	}

	private async openNode(node: TreeNode, newTab: boolean): Promise<void> {
		if (node.type === 'core') await this.controller.core.open(node.bookmark, newTab);
		else if (node.type === 'note') {
			const file = this.app.vault.getFileByPath(node.path);
			if (!file) { new Notice('This note no longer exists.'); return; }
			try { await this.app.workspace.getLeaf(newTab ? 'tab' : false).openFile(file); }
			catch { new Notice('Could not open this note.'); }
		}
	}

	private iconButton(parent: HTMLElement, icon: string, label: string, scope: Component,
		callback: (event: MouseEvent) => void | Promise<void>, focusId?: string): HTMLElement {
		const button = parent.createDiv({ cls: 'clickable-icon nav-action-button ab-icon-button', title: label, attr: { 'aria-label': label, role: 'button', tabindex: '0' } });
		if (focusId) button.setAttribute('data-focus', focusId);
		setIcon(button, icon);
		scope.registerDomEvent(button, 'click', (event) => {
			event.stopPropagation(); if (button.getAttribute('aria-disabled') !== 'true') void callback(event);
		});
		scope.registerDomEvent(button, 'keydown', (event) => {
			if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); button.click(); }
		});
		return button;
	}
}

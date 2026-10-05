import type { Component } from 'obsidian';
import type { BookmarkController } from '../services/controller';
import { moveTreeItem } from '../services/reordering';
import { isContainer, isDraggable, locateNode, planMove, type DropPosition } from '../model/order';
import type { TreeNode } from '../model/tree';

export class TreeDrag {
	private sourceId: string | null = null;
	private marker: HTMLElement | null = null;
	private busy = false;
	constructor(private controller: BookmarkController, private tree: () => TreeNode[], private filtered: () => boolean, private render: () => void) {}
	get active(): boolean { return this.sourceId !== null; }
	end(): void { this.sourceId = null; this.clearMarker(); this.render(); }

	private allowed(node: TreeNode, parent: TreeNode | null): boolean {
		return !this.filtered() && !this.busy && isDraggable(node, parent) && (node.type !== 'core' || this.controller.core.canMove());
	}

	attach(row: HTMLElement, node: TreeNode, parent: TreeNode | null, scope: Component): void {
		row.draggable = this.allowed(node, parent);
		scope.registerDomEvent(row, 'dragstart', (event) => {
			if (!this.allowed(node, parent) || (event.target as HTMLElement).closest('.ab-icon-button, button, input, select')) { event.preventDefault(); return; }
			this.sourceId = node.id; row.addClass('is-being-dragged');
			if (event.dataTransfer) {
				event.dataTransfer.effectAllowed = 'move';
				event.dataTransfer.setData('application/x-advanced-bookmarks', node.id);
				event.dataTransfer.setData('text/plain', node.name);
			}
		});
		scope.registerDomEvent(row, 'dragend', () => this.end());
		scope.registerDomEvent(row, 'dragover', (event) => {
			if (!this.sourceId) return;
			this.clearMarker();
			const position = this.position(event, row, node);
			if (!planMove(this.tree(), this.sourceId, node.id, position)) {
				if (event.dataTransfer) event.dataTransfer.dropEffect = 'none'; return;
			}
			event.preventDefault(); event.stopPropagation();
			if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
			this.marker = row; row.addClass(position === 'inside' ? 'is-being-dragged-over' : `ab-drop-${position}`);
		});
		scope.registerDomEvent(row, 'dragleave', () => { if (this.marker === row) this.clearMarker(); });
		scope.registerDomEvent(row, 'drop', (event) => {
			const id = this.sourceId; if (!id) return;
			const position = this.position(event, row, node);
			if (!planMove(this.tree(), id, node.id, position)) return;
			event.preventDefault(); event.stopPropagation(); this.sourceId = null; this.clearMarker();
			void this.move(id, node.id, position);
		});
	}

	/** Also usable on platforms where HTML drag and drop is unavailable. */
	keyboard(event: KeyboardEvent, node: TreeNode, parent: TreeNode | null): boolean {
		if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key) || !this.allowed(node, parent)) return false;
		const siblings = locateNode(this.tree(), node.id)?.siblings ?? [];
		const index = siblings.findIndex((item) => item.id === node.id);
		const target = siblings[index + (event.key === 'ArrowUp' ? -1 : 1)];
		const position = event.key === 'ArrowUp' ? 'before' : 'after';
		if (!target || !planMove(this.tree(), node.id, target.id, position)) return false;
		event.preventDefault(); event.stopPropagation(); void this.move(node.id, target.id, position); return true;
	}

	private position(event: DragEvent, row: HTMLElement, node: TreeNode): DropPosition {
		const rect = row.getBoundingClientRect();
		const fraction = (event.clientY - rect.top) / rect.height;
		return isContainer(node) && fraction > 0.25 && fraction < 0.75 ? 'inside' : fraction < 0.5 ? 'before' : 'after';
	}
	private clearMarker(): void { this.marker?.removeClass('ab-drop-before', 'ab-drop-after', 'is-being-dragged-over'); this.marker = null; }
	private async move(id: string, target: string, position: DropPosition): Promise<void> {
		this.busy = true;
		try { await moveTreeItem(this.controller, id, target, position); }
		finally { this.busy = false; this.render(); }
	}
}

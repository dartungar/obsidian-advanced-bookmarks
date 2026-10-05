import type { BookmarkController } from './controller';
import { buildTree } from '../model/tree';
import { mergeManualOrder, orderKey, planMove, type DropPosition } from '../model/order';

export async function moveTreeItem(controller: BookmarkController, sourceId: string, targetId: string, position: DropPosition): Promise<boolean> {
	const { data, core, notes, bases } = controller;
	const tree = buildTree(core.items, data.folders, notes.get(), data.folderNotes, bases.results(data.folders), data.itemOrder);
	const plan = planMove(tree, sourceId, targetId, position);
	if (!plan) return false;
	if (plan.type === 'manual') {
		const folder = data.folders.find((folder) => folder.id === plan.folderId);
		if (!folder || folder.sort !== 'manual') return false;
		folder.manualOrder = mergeManualOrder(folder.manualOrder ?? [], plan.paths);
	} else {
		if (plan.source.type === 'core' && !await core.move(sourceId, plan.parentId, plan.beforeCoreId)) return false;
		if (plan.source.type === 'folder') plan.source.folder.parentId = plan.parentId;
		if (plan.oldParentId !== plan.parentId) {
			const old = orderKey(plan.oldParentId);
			if (data.itemOrder[old]) data.itemOrder[old] = data.itemOrder[old].filter((id) => id !== sourceId);
		}
		data.itemOrder[orderKey(plan.parentId)] = plan.ids;
	}
	return controller.save();
}

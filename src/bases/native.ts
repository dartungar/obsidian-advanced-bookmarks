import { App, parseYaml } from 'obsidian';
import type { BaseReference } from '../types';
import { record } from '../model/data';

interface NativeQueryHandler { handler: (flags: Record<string, string>) => Promise<unknown> }

/** Private runtime access stays here; no subprocess, partial evaluator, or Base file writes. */
export function nativeBaseHandler(app: App): NativeQueryHandler | null {
	const runtime = app as unknown as { cli?: { handlers?: Map<string, NativeQueryHandler> } };
	const handlers = runtime.cli?.handlers;
	if (typeof handlers?.get !== 'function') return null;
	const handler = handlers.get('base:query');
	return handler && typeof handler.handler === 'function' ? handler : null;
}

export async function baseViewNames(app: App, path: string): Promise<string[]> {
	const file = app.vault.getFileByPath(path);
	if (!file || file.extension !== 'base') throw new Error('Select an existing .base file.');
	const config = record(parseYaml(await app.vault.cachedRead(file)) as unknown);
	if (!config || !Array.isArray(config.views)) throw new Error('This base has no named views.');
	const names = (config.views as unknown[]).map((value) => record(value)?.name)
		.filter((name): name is string => typeof name === 'string' && Boolean(name.trim()));
	if (!names.length) throw new Error('This base has no named views.');
	return names;
}

export async function queryNativeBase(app: App, reference: BaseReference): Promise<string[]> {
	const query = nativeBaseHandler(app);
	if (!query) throw new Error('Enable Bases and update Obsidian to use native base queries.');
	const names = await baseViewNames(app, reference.path);
	if (names.filter((name) => name === reference.view).length !== 1) throw new Error('The selected base view is missing or its name is duplicated.');
	// The paths format avoids collisions with user-renamed columns named "path" in JSON output.
	const output = await query.handler({ path: reference.path, view: reference.view, format: 'paths' });
	if (typeof output !== 'string') throw new Error('Obsidian returned an unsupported base query result.');
	const paths = output ? output.split('\n').map((path) => path.replace(/\r$/, '')) : [];
	if (paths.some((path) => !app.vault.getFileByPath(path))) throw new Error('Obsidian returned an invalid base query result.');
	return [...new Set(paths)].filter((path) => app.vault.getFileByPath(path)?.extension === 'md');
}

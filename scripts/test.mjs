import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const directory = await mkdtemp(join(tmpdir(), 'advanced-bookmarks-tests-'));
try {
	const outfile = join(directory, 'tests.cjs');
	await build({ entryPoints: ['tests/index.ts'], bundle: true, platform: 'node', format: 'cjs', outfile,
		alias: { obsidian: join(process.cwd(), 'tests/obsidian-stub.ts') } });
	// node:test runs directly too, without requiring a separate test worker process.
	const result = spawnSync(process.execPath, [outfile], { stdio: 'inherit' });
	process.exitCode = result.status ?? 1;
} finally {
	await rm(directory, { recursive: true, force: true });
}

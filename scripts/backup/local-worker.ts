import { promises as fs } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { Miniflare, type ReplaceWorkersTypes } from 'miniflare';
import type { Fetcher } from '@cloudflare/workers-types';
import { patchBundleForMiniflare } from '../export-content';

const root = path.resolve(import.meta.dirname, '..', '..');

function stripJsonc(source: string): string {
	return source
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/^\s*\/\/.*$/gm, '')
		.replace(/,\s*([}\]])/g, '$1');
}

/** Boots the Worker on the local D1/R2 state (same harness as export:content). */
export async function buildLocalWorker(): Promise<{
	worker: ReplaceWorkersTypes<Fetcher>;
	dispose: () => Promise<void>;
}> {
	const config = JSON.parse(stripJsonc(await fs.readFile(path.join(root, 'wrangler.jsonc'), 'utf-8'))) as Record<
		string,
		unknown
	>;
	const d1 = (config.d1_databases as Array<{ binding: string; database_id?: string }> | undefined)?.[0];
	if (!d1) {
		throw new Error('No d1_databases binding found in wrangler.jsonc');
	}
	const r2 = (config.r2_buckets as Array<{ binding: string; bucket_name: string }> | undefined)?.[0];

	const bundle = await build({
		entryPoints: [path.join(root, 'worker', 'index.ts')],
		bundle: true,
		format: 'esm',
		platform: 'browser',
		target: 'es2022',
		write: false,
		logLevel: 'silent',
	});

	const mf = new Miniflare({
		script: patchBundleForMiniflare(bundle.outputFiles[0].text),
		modules: true,
		compatibilityDate: typeof config.compatibility_date === 'string' ? config.compatibility_date : undefined,
		compatibilityFlags: ['nodejs_compat'],
		d1Databases: { [d1.binding]: d1.database_id ?? d1.binding },
		r2Buckets: r2 ? { [r2.binding]: r2.bucket_name } : undefined,
		bindings: {
			BACKUP_TOKEN: 'local-backup',
			BETTER_AUTH_SECRET: 'local-backup-dummy',
			BETTER_AUTH_URL: 'http://localhost',
		},
		resourcePersistencePath: path.join(root, '.wrangler', 'state', 'v3'),
	});
	const worker = await mf.getWorker();
	return { worker, dispose: () => mf.dispose() };
}

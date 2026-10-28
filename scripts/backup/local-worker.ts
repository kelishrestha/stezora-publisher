import { promises as fs } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { patchBundleForMiniflare } from '../export-content';

type LocalWorker = Awaited<ReturnType<Miniflare['getWorker']>>;

const root = path.resolve(import.meta.dirname, '..', '..');

function stripJsonc(source: string): string {
	return source
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/^\s*\/\/.*$/gm, '')
		.replace(/,\s*([}\]])/g, '$1');
}

export interface LocalWorkerOptions {
	/**
	 * Force the MEDIA bucket on even when wrangler.jsonc has no r2_buckets
	 * (media storage disabled). The local Miniflare R2 state is keyed by bucket
	 * name, so the localized objects stay readable for backups.
	 */
	forceMediaStorage?: boolean;
}

/** Boots the Worker on the local D1/R2 state (same harness as export:content). */
export async function buildLocalWorker(options: LocalWorkerOptions = {}): Promise<{
	worker: LocalWorker;
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
	const r2 =
		(config.r2_buckets as Array<{ binding: string; bucket_name: string }> | undefined)?.[0] ??
		(options.forceMediaStorage ? { binding: 'MEDIA', bucket_name: 'stezora-publisher-media' } : undefined);

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
			...((config.vars as Record<string, string> | undefined) ?? {}),
			...(options.forceMediaStorage ? { ENABLE_MEDIA_STORAGE: 'true' } : {}),
			BACKUP_TOKEN: 'local-backup',
			BETTER_AUTH_SECRET: 'local-backup-dummy',
			BETTER_AUTH_URL: 'http://localhost',
		},
		resourcePersistencePath: path.join(root, '.wrangler', 'state', 'v3'),
	});
	const worker = await mf.getWorker();
	return { worker, dispose: () => mf.dispose() };
}

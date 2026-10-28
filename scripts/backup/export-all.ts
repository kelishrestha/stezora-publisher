import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Full-fidelity content backup: pulls /api/export and writes one JSON file
 * per post plus one file per table into the target directory, so a git-backed
 * backup shows readable per-post diffs.
 *
 * Remote mode (CI): BACKUP_EXPORT_URL=https://site/api/export BACKUP_TOKEN=...
 * Local mode (no env): spins up the Worker on local D1 via Miniflare.
 */

interface ExportData {
	exportedAt: string;
	schema: string;
	counts: Record<string, number>;
	publications: unknown[];
	posts: Array<Record<string, unknown> & { id: string }>;
	tags: unknown[];
	postTags: unknown[];
	media: unknown[];
	bloggerSync: unknown[];
}

async function fetchRemote(url: string, token: string | undefined): Promise<ExportData> {
	const response = await fetch(url, token ? { headers: { authorization: `Bearer ${token}` } } : undefined);
	if (!response.ok) {
		throw new Error(`GET ${url} failed with status ${response.status}`);
	}
	const body = (await response.json()) as { success: boolean; data: ExportData };
	if (!body.success) {
		throw new Error('Export endpoint returned an error envelope.');
	}
	return body.data;
}

async function fetchLocal(): Promise<ExportData> {
	// Reuse the Miniflare harness that export:content uses.
	const { buildLocalWorker } = await import('./local-worker');
	const { worker, dispose } = await buildLocalWorker();
	try {
		const response = await worker.fetch('http://localhost/api/export', {
			headers: { authorization: 'Bearer local-backup' },
		});
		if (!response.ok) {
			throw new Error(`Local /api/export failed with status ${response.status}`);
		}
		const body = (await response.json()) as { data: ExportData };
		return body.data;
	} finally {
		await dispose();
	}
}

export async function writeBackup(dir: string, data: ExportData): Promise<void> {
	if (!Array.isArray(data.posts) || data.posts.length === 0) {
		throw new Error('Refusing to write a backup with zero posts; the source looks empty or broken.');
	}
	await fs.rm(path.join(dir, 'posts'), { recursive: true, force: true });
	await fs.mkdir(path.join(dir, 'posts'), { recursive: true });
	for (const post of data.posts) {
		await fs.writeFile(path.join(dir, 'posts', `${post.id}.json`), `${JSON.stringify(post, null, 2)}\n`, 'utf-8');
	}
	for (const table of ['publications', 'tags', 'postTags', 'media', 'bloggerSync'] as const) {
		await fs.writeFile(path.join(dir, `${table}.json`), `${JSON.stringify(data[table], null, 2)}\n`, 'utf-8');
	}
	await fs.writeFile(
		path.join(dir, 'manifest.json'),
		`${JSON.stringify({ exportedAt: data.exportedAt, schema: data.schema, counts: data.counts }, null, 2)}\n`,
		'utf-8'
	);
}

async function main(): Promise<void> {
	const dir = process.argv[2] ?? 'backups/content';
	const url = process.env.BACKUP_EXPORT_URL;
	const data = url ? await fetchRemote(url, process.env.BACKUP_TOKEN) : await fetchLocal();
	await writeBackup(dir, data);
	console.error(`backup: wrote ${data.posts.length} post(s) and ${Object.keys(data.counts).length} tables to ${dir}`);
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMain) {
	await main();
}

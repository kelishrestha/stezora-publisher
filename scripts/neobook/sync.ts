import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Miniflare } from 'miniflare';
import { syncNeobook } from '../../worker/lib/neobook';

/**
 * One-way sync from the Neobook profile (https://neobook.org/stezora/) into
 * the local D1 database. The sync logic lives in worker/lib/neobook.ts so the
 * CLI and the admin "Sync" button run exactly the same code; this wrapper only
 * opens the local D1 and R2 via Miniflare and prints the summary.
 *
 * Run with: pnpm neobook:sync
 */

const root = path.resolve(import.meta.dirname, '..', '..');

async function main(): Promise<void> {
	const wrangler = await fs.readFile(path.join(root, 'wrangler.jsonc'), 'utf-8');
	const databaseId = /"database_id"\s*:\s*"([^"]+)"/.exec(wrangler)?.[1];
	if (!databaseId) {
		throw new Error('No database_id found in wrangler.jsonc');
	}

	const mf = new Miniflare({
		script: 'export default { fetch: () => new Response("ok") }',
		modules: true,
		d1Databases: { DB: databaseId },
		r2Buckets: { MEDIA: 'stezora-publisher-media' },
		resourcePersistencePath: path.join(root, '.wrangler', 'state', 'v3'),
	});

	try {
		const db = await mf.getD1Database('DB');
		const bucket = await mf.getR2Bucket('MEDIA');

		const summary = await syncNeobook(db as unknown as D1Database, bucket as unknown as R2Bucket);
		console.error(`neobook:sync: ${summary.items} item(s) on the profile`);
		console.error(
			`neobook:sync: ${summary.postsCreated} post(s) created, ${summary.contentUpdates} content update(s), ` +
				`${summary.imagesAttached} featured image(s) attached, ${summary.tagsCreated} tag(s) created, ` +
				`${summary.booksCreated} book(s) created, ${summary.booksUpdated} book(s) updated`
		);
		if (summary.unmatched.length > 0) {
			console.error(`neobook:sync: ${summary.unmatched.length} item(s) with no matching post:`);
			for (const title of summary.unmatched) {
				console.error(`  - ${title}`);
			}
		}
	} finally {
		await mf.dispose();
	}
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMain) {
	await main();
}

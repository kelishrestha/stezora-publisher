import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildLocalWorker } from './local-worker';

/**
 * Backs up every local R2 media object into a repo folder (media-backup/),
 * keyed exactly as the database references them, so the bytes live in git
 * next to the content. Rerun after new uploads or localizations.
 *
 * Usage: pnpm backup:media [dir]
 */

async function main(): Promise<void> {
	const dir = process.argv[2] ?? 'media-backup';
	const { worker, dispose } = await buildLocalWorker({ forceMediaStorage: true });
	let written = 0;
	const failures: string[] = [];
	try {
		const exportResponse = await worker.fetch('http://localhost/api/export', {
			headers: { authorization: 'Bearer local-backup' },
		});
		if (!exportResponse.ok) {
			throw new Error(`Local export failed (${exportResponse.status}).`);
		}
		const body = (await exportResponse.json()) as { data: { media: Array<{ r2_key: string | null }> } };
		const keys = body.data.media.map((row) => row.r2_key).filter((key): key is string => key !== null);
		console.error(`backup:media: ${keys.length} object(s)`);

		for (const key of keys) {
			const download = await worker.fetch(`http://localhost/media/${key}`);
			if (!download.ok) {
				failures.push(key);
				console.error(`  FAIL ${key} (${download.status})`);
				continue;
			}
			const file = path.join(dir, key);
			mkdirSync(path.dirname(file), { recursive: true });
			writeFileSync(file, Buffer.from(await download.arrayBuffer()));
			written += 1;
		}
	} finally {
		await dispose();
	}
	console.error(`backup:media: ${written} written to ${dir}, ${failures.length} failed`);
	if (failures.length > 0) {
		process.exitCode = 1;
	}
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMain) {
	await main();
}

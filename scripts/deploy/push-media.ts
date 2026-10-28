import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildLocalWorker } from '../backup/local-worker';

/**
 * Pushes every local R2 media object to the remote bucket. Used when
 * bootstrapping production from the local database (the SQL dump carries the
 * media rows; this carries the bytes they reference).
 *
 * Usage: pnpm deploy:media
 */

async function main(): Promise<void> {
	const { worker, dispose } = await buildLocalWorker();
	const scratch = mkdtempSync(path.join(tmpdir(), 'stezora-media-'));
	let pushed = 0;
	const failures: string[] = [];
	try {
		const exportResponse = await worker.fetch('http://localhost/api/export', {
			headers: { authorization: 'Bearer local-backup' },
		});
		if (!exportResponse.ok) {
			throw new Error(`Local export failed (${exportResponse.status}).`);
		}
		const body = (await exportResponse.json()) as {
			data: { media: Array<{ r2_key: string | null; mime_type: string }> };
		};
		const objects = body.data.media.filter(
			(row): row is { r2_key: string; mime_type: string } => row.r2_key !== null
		);
		console.error(`push-media: ${objects.length} object(s) to upload`);

		for (const object of objects) {
			const download = await worker.fetch(`http://localhost/media/${object.r2_key}`);
			if (!download.ok) {
				failures.push(object.r2_key);
				console.error(`  FAIL read ${object.r2_key} (${download.status})`);
				continue;
			}
			const file = path.join(scratch, object.r2_key.replace(/\//g, '__'));
			writeFileSync(file, Buffer.from(await download.arrayBuffer()));
			const result = spawnSync(
				'npx',
				[
					'wrangler',
					'r2',
					'object',
					'put',
					`stezora-publisher-media/${object.r2_key}`,
					'--file',
					file,
					'--content-type',
					object.mime_type,
					'--remote',
				],
				{ stdio: ['ignore', 'ignore', 'inherit'] }
			);
			if (result.status === 0) {
				pushed += 1;
				console.error(`  ok   ${object.r2_key}`);
			} else {
				failures.push(object.r2_key);
				console.error(`  FAIL put ${object.r2_key}`);
			}
		}
	} finally {
		rmSync(scratch, { recursive: true, force: true });
		await dispose();
	}
	console.error(`push-media: ${pushed} uploaded, ${failures.length} failed`);
	if (failures.length > 0) {
		process.exitCode = 1;
	}
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMain) {
	await main();
}

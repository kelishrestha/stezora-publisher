import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Byte-exact database backup: wraps `wrangler d1 export`. This is the only
 * layer that captures the auth tables and exact schema; replay with
 * `wrangler d1 execute stezora-publisher-db --local --file <dump>`.
 *
 * Usage: tsx scripts/backup/dump-d1.ts [outFile] [--local]
 */
const outFile = process.argv[2] ?? `backups/db/stezora-publisher-${new Date().toISOString().slice(0, 10)}.sql`;
const target = process.argv.includes('--local') ? '--local' : '--remote';

mkdirSync(path.dirname(outFile), { recursive: true });

const result = spawnSync(
	'npx',
	['wrangler', 'd1', 'export', 'stezora-publisher-db', target, '--output', outFile],
	{ stdio: 'inherit' }
);
if (result.status !== 0) {
	process.exit(result.status ?? 1);
}
console.error(`backup: wrote SQL dump to ${outFile}`);

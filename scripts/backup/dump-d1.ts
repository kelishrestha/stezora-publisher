import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Byte-exact database backup: wraps `wrangler d1 export`, then reorders the
 * statements (tables, then data, then indexes) because wrangler emits inserts
 * for child tables before their foreign-key targets exist, which fails on
 * replay. Replay with `wrangler d1 execute ... --file <dump>`.
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

/** Split on semicolons outside single-quoted strings ('' escapes a quote). */
function splitStatements(sql: string): string[] {
	const statements: string[] = [];
	let buffer = '';
	let inString = false;
	for (let i = 0; i < sql.length; i += 1) {
		const char = sql[i];
		buffer += char;
		if (inString) {
			if (char === "'") {
				if (sql[i + 1] === "'") {
					buffer += "'";
					i += 1;
				} else {
					inString = false;
				}
			}
		} else if (char === "'") {
			inString = true;
		} else if (char === ';') {
			statements.push(buffer.trim());
			buffer = '';
		}
	}
	const tail = buffer.trim();
	if (tail) {
		statements.push(tail);
	}
	return statements;
}

const statements = splitStatements(readFileSync(outFile, 'utf-8'));
const isIndex = (s: string) => s.toUpperCase().startsWith('CREATE ') && s.toUpperCase().split('(')[0].includes('INDEX');
const pragmas = statements.filter((s) => s.toUpperCase().startsWith('PRAGMA'));
const creates = statements.filter((s) => s.toUpperCase().startsWith('CREATE TABLE'));
const inserts = statements.filter((s) => s.toUpperCase().startsWith('INSERT'));
const indexes = statements.filter(isIndex);
const known = new Set([...pragmas, ...creates, ...inserts, ...indexes]);
const others = statements.filter((s) => !known.has(s));
writeFileSync(outFile, `${[...pragmas, ...creates, ...inserts, ...indexes, ...others].join('\n')}\n`, 'utf-8');

console.error(`backup: wrote replay-safe SQL dump to ${outFile} (${statements.length} statements)`);

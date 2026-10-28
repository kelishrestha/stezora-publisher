import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Byte-exact database backup: wraps `wrangler d1 export`, then rewrites the
 * statement order so the dump replays against REMOTE D1, where wrangler
 * executes the file in multiple batches (each its own transaction) and
 * `PRAGMA defer_foreign_keys` cannot carry forward references across them:
 *
 * - all CREATE TABLE statements first, then data, then indexes;
 * - INSERTs grouped per table in foreign key dependency order;
 * - the posts <-> media cycle is broken by inserting posts with a NULL
 *   featured_image_id and restoring the values with UPDATEs after media.
 *
 * Replay with `wrangler d1 execute ... --file <dump>` (local or remote).
 *
 * Usage: tsx scripts/backup/dump-d1.ts [outFile] [--local]
 */
const outFile = process.argv[2] ?? `backups/db/stezora-publisher-${new Date().toISOString().slice(0, 10)}.sql`;
const target = process.argv.includes('--local') ? '--local' : '--remote';

// Parents before children. Tables missing from the dump are skipped; tables
// missing from this list fail loudly rather than replay in a broken order.
const TABLE_ORDER = [
	'd1_migrations',
	'user',
	'account',
	'session',
	'verification',
	'rate_limit',
	'publications',
	'tags',
	'posts',
	'media',
	'post_tags',
	'blogger_sync',
];

mkdirSync(path.dirname(outFile), { recursive: true });

const result = spawnSync(
	'npx',
	['wrangler', 'd1', 'export', 'stezora-app-db', target, '--output', outFile],
	{ stdio: 'inherit' }
);
if (result.status !== 0) {
	process.exit(result.status ?? 1);
}

/** Split on separators outside single-quoted strings ('' escapes a quote). */
function splitOutsideStrings(sql: string, separator: string): string[] {
	const parts: string[] = [];
	let buffer = '';
	let inString = false;
	let depth = 0;
	for (let i = 0; i < sql.length; i += 1) {
		const char = sql[i];
		if (inString) {
			buffer += char;
			if (char === "'") {
				if (sql[i + 1] === "'") {
					buffer += "'";
					i += 1;
				} else {
					inString = false;
				}
			}
			continue;
		}
		if (char === "'") {
			inString = true;
			buffer += char;
		} else if (char === '(') {
			depth += 1;
			buffer += char;
		} else if (char === ')') {
			depth -= 1;
			buffer += char;
		} else if (char === separator && depth === 0) {
			parts.push(buffer);
			buffer = '';
		} else {
			buffer += char;
		}
	}
	parts.push(buffer);
	return parts;
}

function splitStatements(sql: string): string[] {
	return splitOutsideStrings(sql, ';')
		.map((statement) => statement.trim())
		.filter(Boolean)
		.map((statement) => `${statement};`);
}

function tableOf(insert: string): string {
	const match = /^INSERT INTO "?([A-Za-z0-9_]+)"?/i.exec(insert);
	if (!match) {
		throw new Error(`Cannot parse the table name from: ${insert.slice(0, 80)}`);
	}
	return match[1];
}

/**
 * Rewrites a posts INSERT so featured_image_id is NULL, returning the UPDATE
 * that restores the original value once the media rows exist.
 */
function splitFeaturedImage(insert: string): { insert: string; update: string | null } {
	const match = /^(INSERT INTO "?posts"? ?\()([^)]+)(\) VALUES ?\()(.*)(\);)$/is.exec(insert);
	if (!match) {
		throw new Error(`Cannot parse a posts INSERT: ${insert.slice(0, 80)}`);
	}
	const columns = match[2].split(',').map((column) => column.trim().replace(/^"|"$/g, ''));
	const values = splitOutsideStrings(match[4], ',').map((value) => value.trim());
	if (columns.length !== values.length) {
		throw new Error(`Column/value mismatch in a posts INSERT: ${insert.slice(0, 80)}`);
	}
	const featuredIndex = columns.indexOf('featured_image_id');
	const idIndex = columns.indexOf('id');
	if (featuredIndex === -1 || idIndex === -1) {
		return { insert, update: null };
	}
	const featured = values[featuredIndex];
	if (featured.toUpperCase() === 'NULL') {
		return { insert, update: null };
	}
	values[featuredIndex] = 'NULL';
	return {
		insert: `${match[1]}${match[2]}${match[3]}${values.join(', ')}${match[5]}`,
		update: `UPDATE "posts" SET featured_image_id = ${featured} WHERE id = ${values[idIndex]};`,
	};
}

const statements = splitStatements(readFileSync(outFile, 'utf-8'));
const isIndex = (s: string) => s.toUpperCase().startsWith('CREATE ') && s.toUpperCase().split('(')[0].includes('INDEX');
const pragmas = statements.filter((s) => s.toUpperCase().startsWith('PRAGMA'));
const creates = statements.filter((s) => s.toUpperCase().startsWith('CREATE TABLE'));
const inserts = statements.filter((s) => s.toUpperCase().startsWith('INSERT'));
const indexes = statements.filter(isIndex);
const known = new Set([...pragmas, ...creates, ...inserts, ...indexes]);
const others = statements.filter((s) => !known.has(s));

const byTable = new Map<string, string[]>();
for (const insert of inserts) {
	const table = tableOf(insert);
	byTable.set(table, [...(byTable.get(table) ?? []), insert]);
}
const unknownTables = [...byTable.keys()].filter((table) => !TABLE_ORDER.includes(table));
if (unknownTables.length > 0) {
	throw new Error(`Tables missing from TABLE_ORDER (add them in dependency order): ${unknownTables.join(', ')}`);
}

const orderedInserts: string[] = [];
const featuredUpdates: string[] = [];
for (const table of TABLE_ORDER) {
	for (const insert of byTable.get(table) ?? []) {
		if (table === 'posts') {
			const { insert: rewritten, update } = splitFeaturedImage(insert);
			orderedInserts.push(rewritten);
			if (update) {
				featuredUpdates.push(update);
			}
		} else {
			orderedInserts.push(insert);
		}
	}
}

writeFileSync(
	outFile,
	`${[...pragmas, ...creates, ...orderedInserts, ...featuredUpdates, ...indexes, ...others].join('\n')}\n`,
	'utf-8'
);

console.error(
	`backup: wrote replay-safe SQL dump to ${outFile} ` +
		`(${creates.length} tables, ${orderedInserts.length} inserts, ${featuredUpdates.length} featured image updates)`
);

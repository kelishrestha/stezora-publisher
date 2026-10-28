import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Splits a SQL dump into sequential chunk files at statement boundaries, as a
 * workaround for D1 internal errors (code 7500) on larger --file imports.
 * Statements keep their order, so a dump from backup:db stays replay-safe;
 * run the chunks in filename order.
 *
 * Usage: tsx scripts/backup/split-sql.ts <dump.sql> [outDir] [maxBytes]
 */
const inFile = process.argv[2];
if (!inFile) {
	console.error('Usage: tsx scripts/backup/split-sql.ts <dump.sql> [outDir] [maxBytes]');
	process.exit(1);
}
const outDir = process.argv[3] ?? path.join(path.dirname(inFile), 'chunks');
const maxBytes = Number(process.argv[4] ?? 50_000);

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

const statements = splitStatements(readFileSync(inFile, 'utf-8'));
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const chunks: string[][] = [[]];
let size = 0;
for (const statement of statements) {
	if (size > 0 && size + statement.length > maxBytes) {
		chunks.push([]);
		size = 0;
	}
	chunks[chunks.length - 1].push(statement);
	size += statement.length + 1;
}

const width = String(chunks.length).length;
for (const [index, chunk] of chunks.entries()) {
	const name = `${String(index + 1).padStart(width, '0')}.sql`;
	writeFileSync(path.join(outDir, name), `${chunk.join('\n')}\n`, 'utf-8');
}

console.error(`split: ${statements.length} statements into ${chunks.length} chunk(s) in ${outDir}`);

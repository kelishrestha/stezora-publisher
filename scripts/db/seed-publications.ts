import { publications } from '../../src/lib/publications/data';
import { sqlNullable, sqlString } from './sql';

const now = new Date().toISOString();

const lines: string[] = [];
for (const publication of publications) {
	lines.push(
		[
			'INSERT OR IGNORE INTO publications (id, name, slug, description, created_at)',
			`VALUES (${sqlString(publication.id)}, ${sqlString(publication.name)}, ${sqlString(publication.slug)}, ${sqlNullable(publication.description)}, ${sqlString(now)});`,
		].join('\n')
	);
}

process.stdout.write(`${lines.join('\n')}\n`);

import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';
import { slugify } from '../src/lib/publications';
import { sanitizeContentHtml } from '../src/lib/blogger/sanitize';

const MARKDOWN_DIR = path.join(process.cwd(), 'src/content/blog');
const JSON_DIR = path.join(process.cwd(), 'src/content/posts');
const ARCHIVE_DIR = path.join(process.cwd(), 'archive/blog');

const dryRun = process.argv.includes('--dry-run');

interface PostRecord {
	title: string;
	excerpt: string;
	publication: string;
	tags: string[];
	pubDate: string;
	updatedDate?: string;
	status: 'published' | 'draft';
	content: string;
}

function toIsoDate(value: unknown): string {
	if (value instanceof Date) return value.toISOString();
	if (typeof value === 'string') return new Date(value).toISOString();
	throw new Error(`Invalid date value: ${String(value)}`);
}

function renderContent(markdown: string): string {
	const html = marked.parse(markdown, { async: false });
	return sanitizeContentHtml(html);
}

async function migrate(): Promise<void> {
	await fs.mkdir(JSON_DIR, { recursive: true });
	if (!dryRun) {
		await fs.mkdir(ARCHIVE_DIR, { recursive: true });
	}

	const entries = await fs.readdir(MARKDOWN_DIR, { withFileTypes: true });
	const files = entries.filter((e) => e.isFile() && e.name.endsWith('.md'));

	if (files.length === 0) {
		console.log('No markdown files found to migrate.');
		return;
	}

	for (const file of files) {
		const sourcePath = path.join(MARKDOWN_DIR, file.name);
		const raw = await fs.readFile(sourcePath, 'utf-8');
		const { data, content } = matter(raw);

		const record: PostRecord = {
			title: String(data.title ?? ''),
			excerpt: String(data.excerpt ?? ''),
			publication: String(data.publication ?? ''),
			tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
			pubDate: toIsoDate(data.pubDate),
			status: data.status === 'draft' ? 'draft' : 'published',
			content: renderContent(content),
		};
		if (data.updatedDate) {
			record.updatedDate = toIsoDate(data.updatedDate);
		}

		const stem = file.name.replace(/\.md$/, '');
		const slug = slugify(stem);
		const jsonPath = path.join(JSON_DIR, `${slug}.json`);
		const archivePath = path.join(ARCHIVE_DIR, file.name);

		if (dryRun) {
			console.log(`[dry-run] would write ${path.relative(process.cwd(), jsonPath)} (${record.title})`);
			continue;
		}

		await fs.writeFile(jsonPath, `${JSON.stringify(record, null, 2)}\n`, 'utf-8');
		await fs.rename(sourcePath, archivePath);
		console.log(`migrated ${file.name} → ${path.relative(process.cwd(), jsonPath)}`);
	}
}

migrate().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});

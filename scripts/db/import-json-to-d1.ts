import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { bloggerBlogIdForPublication } from '../../src/lib/blogger/config';
import { sanitizeContentHtml } from '../../src/lib/blogger/sanitize';
import { readExistingPosts } from '../../src/lib/blogger/storage';
import type { PostRecord } from '../../src/lib/blogger/types';
import { publications } from '../../src/lib/publications/data';
import { slugify } from '../../src/lib/publications';
import { sqlNullable, sqlString, sqlUpsertSet } from './sql';

export interface BackfillInput {
	filePath: string;
	record: PostRecord;
}

export interface BackfillOptions {
	blogIdsByPublication?: Map<string, string>;
	now?: string;
}

const POST_COLUMNS = [
	'id',
	'publication_id',
	'category_id',
	'title',
	'slug',
	'excerpt',
	'content',
	'status',
	'published_at',
	'updated_at',
	'canonical_url',
	'blogger_blog_id',
	'blogger_post_id',
	'created_at',
];

const POST_UPSERT_COLUMNS = [
	'title',
	'excerpt',
	'content',
	'status',
	'published_at',
	'updated_at',
	'canonical_url',
	'blogger_blog_id',
	'blogger_post_id',
	'category_id',
];

export function buildBackfillSql(records: BackfillInput[], options: BackfillOptions = {}): string {
	const now = options.now ?? new Date().toISOString();
	const blogIds = options.blogIdsByPublication ?? new Map<string, string>();
	const publicationIdBySlug = new Map(publications.map((publication) => [publication.slug, publication.id]));

	const lines: string[] = [];
	const emittedTagSlugs = new Set<string>();

	for (const { filePath, record } of records) {
		const publicationId = publicationIdBySlug.get(record.publication);
		if (!publicationId) {
			console.warn(`Skipping ${filePath}: unknown publication "${record.publication}"`);
			continue;
		}
		const basename = path.basename(filePath, '.json');
		const prefix = `${record.publication}-`;
		if (!basename.startsWith(prefix)) {
			console.warn(`Skipping ${filePath}: filename does not start with "${prefix}"`);
			continue;
		}
		const postSlug = basename.slice(prefix.length);
		const postId = `p-${publicationId}-${postSlug}`;

		const categorySlug = slugify(record.category) || 'uncategorized';
		const categoryId = `c-${publicationId}-${categorySlug}`;

		const blogId = blogIds.get(record.publication);
		const hasBloggerId = Boolean(record.bloggerPostId && blogId);
		const bloggerPostId = hasBloggerId ? record.bloggerPostId : null;
		const bloggerBlogId = hasBloggerId ? blogId : null;

		lines.push(
			[
				'INSERT INTO categories (id, publication_id, name, slug)',
				`VALUES (${sqlString(categoryId)}, ${sqlString(publicationId)}, ${sqlString(record.category)}, ${sqlString(categorySlug)})`,
				'ON CONFLICT (publication_id, slug) DO NOTHING;',
			].join('\n')
		);

		for (const tag of record.tags) {
			const tagSlug = slugify(tag);
			if (!tagSlug) {
				continue;
			}
			if (!emittedTagSlugs.has(tagSlug)) {
				emittedTagSlugs.add(tagSlug);
				lines.push(
					[
						'INSERT INTO tags (id, name, slug)',
						`VALUES (${sqlString(`t-${tagSlug}`)}, ${sqlString(tag)}, ${sqlString(tagSlug)})`,
						'ON CONFLICT (slug) DO NOTHING;',
					].join('\n')
				);
			}
		}

		if (hasBloggerId && blogId) {
			lines.push(
				[
					'UPDATE posts SET blogger_blog_id =',
					sqlString(blogId),
					', blogger_post_id =',
					sqlString(record.bloggerPostId),
					`WHERE publication_id = ${sqlString(publicationId)} AND slug = ${sqlString(postSlug)} AND blogger_post_id IS NULL;`,
				].join(' ')
			);
		}

		const conflictTarget = hasBloggerId
			? 'ON CONFLICT (blogger_blog_id, blogger_post_id) DO UPDATE SET\n  '
			: 'ON CONFLICT (publication_id, slug) DO UPDATE SET\n  ';

		lines.push(
			[
				`INSERT INTO posts (${POST_COLUMNS.join(', ')})`,
				[
					'VALUES (',
					sqlString(postId),
					`, ${sqlString(publicationId)}`,
					`, (SELECT id FROM categories WHERE publication_id = ${sqlString(publicationId)} AND slug = ${sqlString(categorySlug)})`,
					`, ${sqlString(record.title)}`,
					`, ${sqlString(postSlug)}`,
					`, ${sqlNullable(record.excerpt)}`,
					`, ${sqlString(sanitizeContentHtml(record.content))}`,
					`, ${sqlString(record.status)}`,
					`, ${sqlString(record.pubDate)}`,
					`, ${sqlNullable(record.updatedDate)}`,
					`, ${sqlNullable(record.bloggerUrl)}`,
					`, ${sqlNullable(bloggerBlogId)}`,
					`, ${sqlNullable(bloggerPostId)}`,
					`, ${sqlString(now)}`,
					')',
				].join(''),
				conflictTarget + sqlUpsertSet(POST_UPSERT_COLUMNS) + ';',
			].join('\n')
		);

		for (const tag of record.tags) {
			const tagSlug = slugify(tag);
			if (!tagSlug) {
				continue;
			}
			lines.push(
				[
					'INSERT INTO post_tags (post_id, tag_id)',
					`SELECT ${sqlString(postId)}, id FROM tags WHERE slug = ${sqlString(tagSlug)}`,
					'ON CONFLICT (post_id, tag_id) DO NOTHING;',
				].join('\n')
			);
		}
	}

	return lines.join('\n');
}

async function main(): Promise<void> {
	const records: BackfillInput[] = [];
	const existing = await readExistingPosts('src/content/posts');
	for (const [filePath, record] of existing.byFile) {
		records.push({ filePath, record });
	}

	const blogIdsByPublication = new Map<string, string>();
	for (const publication of publications) {
		try {
			blogIdsByPublication.set(publication.slug, bloggerBlogIdForPublication(publication.slug));
		} catch {
			// Blogger blog ID not configured for this publication; posts keep NULL Blogger ids.
		}
	}

	process.stdout.write(`${buildBackfillSql(records, { blogIdsByPublication })}\n`);
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMain) {
	await main();
}

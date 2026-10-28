import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { bloggerBlogIdForPublication } from '../../src/lib/blogger/config';
import { sanitizeContentHtml } from '../../src/lib/blogger/sanitize';
import { stripImages, unwrapBloggerImages } from '../../src/lib/blogger/html';
import { htmlToMarkdown } from '../../src/lib/blogger/to-markdown';
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
	'title',
	'slug',
	'excerpt',
	'content',
	'content_markdown',
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
	'content_markdown',
	'status',
	'published_at',
	'updated_at',
	'canonical_url',
	'blogger_blog_id',
	'blogger_post_id',
];

function stableHash(value: string): string {
	let hash = 2166136261;
	for (let i = 0; i < value.length; i += 1) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
}

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

		const blogId = blogIds.get(record.publication);
		const hasBloggerId = Boolean(record.bloggerPostId && blogId);
		const bloggerPostId = hasBloggerId ? record.bloggerPostId : null;
		const bloggerBlogId = hasBloggerId ? blogId : null;

		for (const tag of record.tags) {
			const tagSlug = slugify(tag);
			if (!tagSlug) {
				continue;
			}
			const tagId = `t-${publicationId}-${tagSlug}`;
			if (!emittedTagSlugs.has(tagId)) {
				emittedTagSlugs.add(tagId);
				lines.push(
					[
						'INSERT INTO tags (id, publication_id, name, slug, created_at)',
						`VALUES (${sqlString(tagId)}, ${sqlString(publicationId)}, ${sqlString(tag)}, ${sqlString(tagSlug)}, ${sqlString(now)})`,
						'ON CONFLICT (publication_id, slug) DO NOTHING;',
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

		// Segregate Blogger's anchor-wrapped images: each becomes a media row
		// (the first one the post's featured image) and the content is stored
		// image-free, so the markdown form stays clean. wrapImagesForBlogger()
		// plus the featured image restores Blogger's format when mirroring.
		const unwrapped = unwrapBloggerImages(sanitizeContentHtml(record.content));
		const imageUrls = [...new Set(Array.from(unwrapped.matchAll(/<img\b[^>]*\ssrc="([^"]+)"/gi), (m) => m[1]))];
		const sanitizedContent = stripImages(unwrapped);
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
					`, ${sqlString(record.title)}`,
					`, ${sqlString(postSlug)}`,
					`, ${sqlNullable(record.excerpt)}`,
					`, ${sqlString(sanitizedContent)}`,
					`, ${sqlString(htmlToMarkdown(sanitizedContent))}`,
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

		// One media row per embedded Blogger image (r2_key stays NULL until the
		// image is localized into R2). Deterministic ids and the
		// (post_id, source_url) unique index keep re-runs idempotent.
		for (const url of imageUrls) {
			const mediaId = `m-${postId}-${stableHash(url)}`;
			lines.push(
				[
					'INSERT INTO media (id, post_id, publication_id, r2_key, source_url, filename, mime_type, size, created_at)',
					[
						'VALUES (',
						sqlString(mediaId),
						`, ${sqlString(postId)}`,
						`, ${sqlString(publicationId)}`,
						', NULL',
						`, ${sqlString(url)}`,
						`, ${sqlString(`blogger-${stableHash(url)}`)}`,
						", 'application/octet-stream'",
						', 0',
						`, ${sqlString(now)}`,
						')',
					].join(''),
					'ON CONFLICT (post_id, source_url) DO NOTHING;',
				].join('\n')
			);
		}

		// The lead image becomes the featured image (rendered above the
		// content). Set after the media insert so the FK target exists, and
		// only when unset so a manual choice in the CMS survives re-runs.
		if (imageUrls.length > 0) {
			const firstMediaId = `m-${postId}-${stableHash(imageUrls[0])}`;
			lines.push(
				`UPDATE posts SET featured_image_id = ${sqlString(firstMediaId)} WHERE id = ${sqlString(postId)} AND featured_image_id IS NULL;`
			);
		}

		for (const tag of record.tags) {
			const tagSlug = slugify(tag);
			if (!tagSlug) {
				continue;
			}
			lines.push(
				[
					'INSERT INTO post_tags (post_id, tag_id)',
					`SELECT ${sqlString(postId)}, id FROM tags WHERE publication_id = ${sqlString(publicationId)} AND slug = ${sqlString(tagSlug)}`,
					'ON CONFLICT (post_id, tag_id) DO NOTHING;',
				].join('\n')
			);
		}
	}

	// Tags created before the created_at column existed get the backfill date.
	lines.push(`UPDATE tags SET created_at = ${sqlString(now)} WHERE created_at IS NULL;`);

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

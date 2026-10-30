import { BloggerClient } from '../../src/lib/blogger/client';
import { makeUniqueSlug, mapPost } from '../../src/lib/blogger/mapper';
import { sanitizeContentHtml } from '../../src/lib/blogger/sanitize';
import { stripImages, unwrapBloggerImages } from '../../src/lib/blogger/html';
import { publications } from '../../src/lib/publications/data';
import { slugify } from '../../src/lib/publications';

/**
 * Blogger import into D1, usable from the admin "Import" button. Blog IDs are
 * sourced from posts already linked to each publication (the authorize flow that
 * would link a fresh blog is separate), so a publication with no Blogger posts
 * yet is reported as "not linked" rather than imported.
 *
 * Only posts not already present (matched by Blogger id) are inserted; existing
 * posts are left untouched so CMS edits are never clobbered. Content is stored
 * as sanitized, image-free HTML with one media row per embedded image (the first
 * becomes the featured image); content_markdown is left null, mirroring the CLI
 * backfill, and the public site renders from the HTML.
 */

export interface BloggerImportCredentials {
	clientId?: string;
	clientSecret?: string;
	refreshToken?: string;
}

export interface BloggerImportPublicationResult {
	slug: string;
	name: string;
	linked: boolean;
	imported: number;
	skipped: number;
}

export interface BloggerImportResult {
	includeDrafts: boolean;
	imported: number;
	skipped: number;
	statsUpdated: number;
	publications: BloggerImportPublicationResult[];
}

export class BloggerNotConfiguredError extends Error {
	constructor() {
		super('Blogger API credentials are not configured on the server.');
		this.name = 'BloggerNotConfiguredError';
	}
}

/** Same FNV-1a id hash the CLI backfill uses, so media ids stay stable. */
function stableHash(value: string): string {
	let hash = 2166136261;
	for (let i = 0; i < value.length; i += 1) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
}

async function blogIdForPublication(db: D1Database, publicationId: string): Promise<string | null> {
	const row = await db
		.prepare('SELECT blogger_blog_id FROM posts WHERE publication_id = ? AND blogger_blog_id IS NOT NULL LIMIT 1')
		.bind(publicationId)
		.first<{ blogger_blog_id: string }>();
	return row?.blogger_blog_id ?? null;
}

const TIME_RANGE_COLUMN: Record<string, 'views_all' | 'views_30d' | 'views_7d'> = {
	ALL_TIME: 'views_all',
	THIRTY_DAYS: 'views_30d',
	SEVEN_DAYS: 'views_7d',
};

/** Fetches Blogger blog-level pageview totals and upserts the per-publication snapshot. */
async function saveBloggerStats(db: D1Database, client: BloggerClient, publicationId: string, blogId: string, now: string): Promise<void> {
	const pageviews = await client.getPageviews();
	const totals: Record<string, number | null> = { views_all: null, views_30d: null, views_7d: null };
	for (const entry of pageviews.counts ?? []) {
		const column = TIME_RANGE_COLUMN[entry.timeRange];
		if (column) {
			const parsed = Number.parseInt(entry.count, 10);
			totals[column] = Number.isFinite(parsed) ? parsed : null;
		}
	}
	await db
		.prepare(
			'INSERT INTO blogger_stats (publication_id, blog_id, views_all, views_30d, views_7d, fetched_at) VALUES (?, ?, ?, ?, ?, ?) ' +
				'ON CONFLICT (publication_id) DO UPDATE SET blog_id = excluded.blog_id, views_all = excluded.views_all, ' +
				'views_30d = excluded.views_30d, views_7d = excluded.views_7d, fetched_at = excluded.fetched_at'
		)
		.bind(publicationId, blogId, totals.views_all, totals.views_30d, totals.views_7d, now)
		.run();
}

async function ensureTags(db: D1Database, publicationId: string, tags: string[], now: string): Promise<string[]> {
	const tagIds: string[] = [];
	for (const name of tags) {
		const slug = slugify(name);
		if (!slug) continue;
		const tagId = `t-${publicationId}-${slug}`;
		await db
			.prepare('INSERT INTO tags (id, publication_id, name, slug, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (publication_id, slug) DO NOTHING')
			.bind(tagId, publicationId, name, slug, now)
			.run();
		tagIds.push(tagId);
	}
	return tagIds;
}

export async function importBlogger(
	db: D1Database,
	credentials: BloggerImportCredentials,
	options: { includeDrafts: boolean }
): Promise<BloggerImportResult> {
	const { clientId, clientSecret, refreshToken } = credentials;
	if (!clientId || !clientSecret || !refreshToken) {
		throw new BloggerNotConfiguredError();
	}

	const statuses = options.includeDrafts ? ['LIVE', 'DRAFT'] : ['LIVE'];
	const now = new Date().toISOString();
	const perPublication: BloggerImportPublicationResult[] = [];
	let totalImported = 0;
	let totalSkipped = 0;
	let statsUpdated = 0;

	for (const publication of publications) {
		const blogId = await blogIdForPublication(db, publication.id);
		if (!blogId) {
			perPublication.push({ slug: publication.slug, name: publication.name, linked: false, imported: 0, skipped: 0 });
			continue;
		}

		const client = new BloggerClient({ blogId, clientId, clientSecret, refreshToken });

		// Blog-level pageview totals. A stats failure (for example when the token
		// lacks the scope) must not abort the post import.
		try {
			await saveBloggerStats(db, client, publication.id, blogId, now);
			statsUpdated += 1;
		} catch {
			// Leave the previous snapshot in place.
		}

		const { results: slugRows } = await db
			.prepare('SELECT slug FROM posts WHERE publication_id = ?')
			.bind(publication.id)
			.all<{ slug: string }>();
		const existingSlugs = new Set(slugRows.map((row) => row.slug));

		let imported = 0;
		let skipped = 0;

		for await (const dto of client.fetchAllPosts({ statuses })) {
			const already = await db
				.prepare('SELECT id FROM posts WHERE blogger_blog_id = ? AND blogger_post_id = ?')
				.bind(blogId, dto.id)
				.first<{ id: string }>();
			if (already) {
				skipped += 1;
				continue;
			}

			const { record, baseSlug } = mapPost(dto, { publicationSlug: publication.slug, blogId, includeDrafts: options.includeDrafts });
			const slug = makeUniqueSlug(baseSlug, existingSlugs);
			existingSlugs.add(slug);
			const postId = `p-${publication.id}-${slug}`;

			const unwrapped = unwrapBloggerImages(sanitizeContentHtml(record.content));
			const imageUrls = [...new Set(Array.from(unwrapped.matchAll(/<img\b[^>]*\ssrc="([^"]+)"/gi), (match) => match[1]))];
			const content = stripImages(unwrapped);
			const publishedAt = record.status === 'draft' ? null : record.pubDate;

			await db
				.prepare(
					'INSERT INTO posts (id, publication_id, title, slug, excerpt, content, content_markdown, status, published_at, updated_at, canonical_url, blogger_blog_id, blogger_post_id, source, created_at) ' +
						"VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 'blogger', ?)"
				)
				.bind(
					postId,
					publication.id,
					record.title,
					slug,
					record.excerpt,
					content,
					record.status,
					publishedAt,
					record.updatedDate ?? now,
					record.bloggerUrl,
					blogId,
					dto.id,
					now
				)
				.run();

			const tagIds = await ensureTags(db, publication.id, record.tags, now);
			for (const tagId of tagIds) {
				await db.prepare('INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)').bind(postId, tagId).run();
			}

			for (const url of imageUrls) {
				const mediaId = `m-${postId}-${stableHash(url)}`;
				await db
					.prepare(
						'INSERT INTO media (id, post_id, publication_id, r2_key, source_url, filename, mime_type, size, created_at) ' +
							'VALUES (?, ?, ?, NULL, ?, ?, ?, 0, ?) ON CONFLICT (post_id, source_url) DO NOTHING'
					)
					.bind(mediaId, postId, publication.id, url, `blogger-${stableHash(url)}`, 'application/octet-stream', now)
					.run();
			}
			if (imageUrls.length > 0) {
				const firstMediaId = `m-${postId}-${stableHash(imageUrls[0])}`;
				await db.prepare('UPDATE posts SET featured_image_id = ? WHERE id = ? AND featured_image_id IS NULL').bind(firstMediaId, postId).run();
			}

			imported += 1;
		}

		perPublication.push({ slug: publication.slug, name: publication.name, linked: true, imported, skipped });
		totalImported += imported;
		totalSkipped += skipped;
	}

	return { includeDrafts: options.includeDrafts, imported: totalImported, skipped: totalSkipped, statsUpdated, publications: perPublication };
}

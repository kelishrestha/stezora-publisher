import { slugify } from '../../src/lib/publications';
import { sanitizeContentHtml } from '../../src/lib/blogger/sanitize';

/**
 * Neobook sync core, usable from both the Worker (admin button) and the CLI.
 * One-way sync: for every Neobook item whose title matches a post, replace the
 * content when it differs and attach the Neobook image as the featured image
 * (into R2) when the post has none. Pure helpers are exported for tests.
 */

const API_URL = 'https://api.neobook.org/';
const API_VERSION = '4.4';
const USER_ID = '82019';

/** Neobook titles that differ from the post titles (normalized on both sides). */
const TITLE_ALIASES: Record<string, string> = {
	'the end of the rebellious flame': 'the end',
	'the clueless nights': 'clueless nights',
	'the queen of knights': 'queen of knights',
};

/** Neobook items with no post yet, created on sync into the given publication. */
const NEW_POSTS: Record<string, string> = {
	rare: 'the-rebellious-flame',
};

export interface NeobookSyncResult {
	items: number;
	postsCreated: number;
	contentUpdates: number;
	imagesAttached: number;
	tagsCreated: number;
	unmatched: string[];
}

interface NeobookItem {
	id: string;
	type: string;
	title: string;
	text: string;
	date_edit: string;
	date_publish: string;
	link_path: string;
	tags?: string[];
	attachment: { has: string; id: string; image?: { l?: string; m?: string } };
}

interface PostRow {
	id: string;
	title: string;
	featured_image_id: string | null;
	content: string;
	publication_id: string;
	publication_slug: string;
	slug: string;
}

export function normalizeTitle(title: string): string {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

/** Neobook text (single/double <br> breaks) as Blogger-style paragraph HTML. */
export function neobookTextToHtml(text: string): string {
	return text
		.split(/(?:<br\s*\/?>\s*){2,}/i)
		.map((paragraph) => paragraph.trim())
		.filter(Boolean)
		.map((paragraph) => `<p>${paragraph.replace(/<br\s*\/?>/gi, '<br />\n')}</p>`)
		.join('\n');
}

/** Whitespace-insensitive plain text, for change detection across formats. */
export function htmlToComparableText(html: string): string {
	return html
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;| /g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Neobook dates look like "02.02.26, 18:00" (dd.mm.yy); treat them as UTC. */
export function neobookDateToIso(value: string): string | null {
	const match = /^(\d{2})\.(\d{2})\.(\d{2}),\s*(\d{2}):(\d{2})$/.exec(value.trim());
	if (!match) {
		return null;
	}
	const [, day, month, year, hours, minutes] = match;
	return `20${year}-${month}-${day}T${hours}:${minutes}:00.000Z`;
}

function mediaSuffix(attachmentId: string): string {
	return Number.parseInt(attachmentId, 10).toString(36);
}

async function fetchFeed(): Promise<NeobookItem[]> {
	const items: NeobookItem[] = [];
	for (let page = 1; page < 50; page += 1) {
		const form = new FormData();
		form.set('version', API_VERSION);
		form.set('uid', '0');
		form.set('utoken', '');
		form.set('resource', 'general');
		form.set('action', 'get_bundle');
		form.set('bundle', 'bundle_user');
		form.set('target', 'feed');
		form.set('user_id', USER_ID);
		form.set('filter_type_id', '0');
		form.set('page', String(page));
		const response = await fetch(API_URL, { method: 'POST', body: form });
		if (!response.ok) {
			throw new Error(`Neobook feed page ${page} failed (${response.status}).`);
		}
		const body = (await response.json()) as { error?: string; bundle_user?: { feed?: NeobookItem[] } };
		if (body.error) {
			throw new Error(`Neobook feed page ${page} returned error: ${body.error}`);
		}
		const feed = body.bundle_user?.feed ?? [];
		if (feed.length === 0) {
			break;
		}
		items.push(...feed);
	}
	return items;
}

async function syncTags(db: D1Database, post: PostRow, tagNames: string[], tagIds: Map<string, string>): Promise<number> {
	let created = 0;
	for (const name of tagNames) {
		const slug = slugify(name);
		if (!slug) continue;
		const cacheKey = `${post.publication_id}/${slug}`;
		let tagId = tagIds.get(cacheKey);
		if (!tagId) {
			tagId = `t-${post.publication_slug}-${slug}`;
			await db
				.prepare('INSERT INTO tags (id, publication_id, name, slug, created_at) VALUES (?, ?, ?, ?, ?)')
				.bind(tagId, post.publication_id, name, slug, new Date().toISOString())
				.run();
			tagIds.set(cacheKey, tagId);
			created += 1;
		}
		await db.prepare('INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)').bind(post.id, tagId).run();
	}
	return created;
}

async function createPost(db: D1Database, publicationSlug: string, item: NeobookItem): Promise<PostRow> {
	const publication = await db.prepare('SELECT id FROM publications WHERE slug = ?').bind(publicationSlug).first<{ id: string }>();
	if (!publication) {
		throw new Error(`Unknown publication slug: ${publicationSlug}`);
	}
	const slug = normalizeTitle(item.title).replace(/ /g, '-');
	const id = `p-${publicationSlug}-${slug}`;
	const content = sanitizeContentHtml(neobookTextToHtml(item.text));
	const publishedAt = neobookDateToIso(item.date_publish) ?? new Date().toISOString();
	const updatedAt = neobookDateToIso(item.date_edit) ?? publishedAt;
	await db
		.prepare(
			'INSERT INTO posts (id, publication_id, title, slug, excerpt, content, status, published_at, updated_at, created_at) ' +
				"VALUES (?, ?, ?, ?, '', ?, 'published', ?, ?, ?)"
		)
		.bind(id, publication.id, item.title, slug, content, publishedAt, updatedAt, new Date().toISOString())
		.run();
	return { id, title: item.title, featured_image_id: null, content, publication_id: publication.id, publication_slug: publicationSlug, slug };
}

export async function syncNeobook(db: D1Database, bucket?: R2Bucket): Promise<NeobookSyncResult> {
	const items = await fetchFeed();

	const { results: posts } = await db
		.prepare(
			'SELECT p.id, p.title, p.featured_image_id, p.content, pub.id AS publication_id, pub.slug AS publication_slug, p.slug ' +
				'FROM posts p JOIN publications pub ON pub.id = p.publication_id'
		)
		.all<PostRow>();
	const byTitle = new Map(posts.map((post) => [normalizeTitle(post.title), post]));

	const { results: tagRows } = await db.prepare('SELECT id, publication_id, slug FROM tags').all<{ id: string; publication_id: string; slug: string }>();
	const tagIds = new Map(tagRows.map((tag) => [`${tag.publication_id}/${tag.slug}`, tag.id]));

	let contentUpdates = 0;
	let imagesAttached = 0;
	let postsCreated = 0;
	let tagsCreated = 0;
	const unmatched: string[] = [];

	for (const item of items) {
		if (item.type === 'book') continue;
		const normalized = normalizeTitle(item.title);
		let post = byTitle.get(normalized) ?? byTitle.get(TITLE_ALIASES[normalized] ?? '');
		if (!post && NEW_POSTS[normalized]) {
			post = await createPost(db, NEW_POSTS[normalized], item);
			byTitle.set(normalized, post);
			postsCreated += 1;
		}
		if (!post) {
			unmatched.push(`${item.type}: ${item.title}`);
			continue;
		}

		tagsCreated += await syncTags(db, post, item.tags ?? [], tagIds);

		const title = item.title.replace(/\u00a0/g, ' ').trim();
		const titleChanged = title !== post.title;
		const contentChanged = htmlToComparableText(item.text) !== htmlToComparableText(post.content);
		if (titleChanged || contentChanged) {
			const updatedAt = neobookDateToIso(item.date_edit) ?? new Date().toISOString();
			const content = contentChanged ? sanitizeContentHtml(neobookTextToHtml(item.text)) : post.content;
			await db.prepare('UPDATE posts SET title = ?, content = ?, updated_at = ? WHERE id = ?').bind(title, content, updatedAt, post.id).run();
			contentUpdates += 1;
		}

		const imageUrl = item.attachment?.has === '1' ? item.attachment.image?.l : undefined;
		if (post.featured_image_id || !imageUrl || !bucket) {
			continue;
		}

		const existing = await db.prepare('SELECT id FROM media WHERE post_id = ? AND source_url = ?').bind(post.id, imageUrl).first<{ id: string }>();
		let mediaId = existing?.id;
		if (!mediaId) {
			const download = await fetch(imageUrl);
			if (!download.ok) continue;
			const bytes = new Uint8Array(await download.arrayBuffer());
			const suffix = mediaSuffix(item.attachment.id);
			mediaId = `m-p-${post.publication_slug}-${post.slug}-${suffix}`;
			const key = `localized/${mediaId}.jpg`;
			await bucket.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
			await db
				.prepare('INSERT INTO media (id, post_id, publication_id, r2_key, source_url, filename, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
				.bind(mediaId, post.id, post.publication_id, key, imageUrl, `neobook-${suffix}.jpg`, 'image/jpeg', bytes.byteLength, new Date().toISOString())
				.run();
		}

		await db.prepare('UPDATE posts SET featured_image_id = ? WHERE id = ?').bind(mediaId, post.id).run();
		imagesAttached += 1;
	}

	return { items: items.length, postsCreated, contentUpdates, imagesAttached, tagsCreated, unmatched };
}

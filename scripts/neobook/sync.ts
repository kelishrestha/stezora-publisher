import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Miniflare } from 'miniflare';
import { slugify } from '../../src/lib/publications';

/**
 * One-way sync from the Neobook profile (https://neobook.org/stezora/) into
 * the local D1 database. Neobook holds the latest revisions of the poems, so
 * for every item whose title matches a post:
 *
 * - the post content is replaced when the text differs (updated_at follows
 *   Neobook's edit date), and
 * - posts without a featured image get the Neobook attachment: the bytes go
 *   into local R2 (so backup:media and deploy:media cover them) and the row
 *   keeps the Neobook CDN URL as source_url for the storage-disabled mode.
 *
 * Idempotent: unchanged content is skipped and media rows are keyed by
 * (post_id, source_url). Run with: pnpm neobook:sync
 */

const API_URL = 'https://api.neobook.org/';
const API_VERSION = '4.4';
const USER_ID = '82019';
const root = path.resolve(import.meta.dirname, '..', '..');

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

function normalizeTitle(title: string): string {
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
		.replace(/&nbsp;| /g, ' ')
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

interface PostRow {
	id: string;
	title: string;
	featured_image_id: string | null;
	content: string;
	publication_id: string;
	publication_slug: string;
	slug: string;
}

type LocalD1 = Awaited<ReturnType<Miniflare['getD1Database']>>;

/**
 * Ensures the item's Neobook tags exist in the post's publication (matched by
 * slug, so Blogger-era lowercase tags are reused) and links them to the post.
 * Existing tags are never removed. Returns the number of tags created.
 */
async function syncTags(db: LocalD1, post: PostRow, tagNames: string[], tagIds: Map<string, string>): Promise<number> {
	let created = 0;
	for (const name of tagNames) {
		const slug = slugify(name);
		if (!slug) {
			continue;
		}
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
		await db
			.prepare('INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)')
			.bind(post.id, tagId)
			.run();
	}
	return created;
}

/** Publishes a Neobook item as a new post following the p-<pub>-<slug> id scheme. */
async function createPost(db: LocalD1, publicationSlug: string, item: NeobookItem): Promise<PostRow> {
	const publication = await db
		.prepare('SELECT id FROM publications WHERE slug = ?')
		.bind(publicationSlug)
		.first<{ id: string }>();
	if (!publication) {
		throw new Error(`Unknown publication slug: ${publicationSlug}`);
	}
	const slug = normalizeTitle(item.title).replace(/ /g, '-');
	const id = `p-${publicationSlug}-${slug}`;
	const content = neobookTextToHtml(item.text);
	const publishedAt = neobookDateToIso(item.date_publish) ?? new Date().toISOString();
	const updatedAt = neobookDateToIso(item.date_edit) ?? publishedAt;
	await db
		.prepare(
			'INSERT INTO posts (id, publication_id, title, slug, excerpt, content, status, published_at, updated_at, created_at) ' +
				"VALUES (?, ?, ?, ?, '', ?, 'published', ?, ?, ?)"
		)
		.bind(id, publication.id, item.title, slug, content, publishedAt, updatedAt, new Date().toISOString())
		.run();
	return {
		id,
		title: item.title,
		featured_image_id: null,
		content,
		publication_id: publication.id,
		publication_slug: publicationSlug,
		slug,
	};
}

async function main(): Promise<void> {
	const wrangler = await fs.readFile(path.join(root, 'wrangler.jsonc'), 'utf-8');
	const databaseId = /"database_id"\s*:\s*"([^"]+)"/.exec(wrangler)?.[1];
	if (!databaseId) {
		throw new Error('No database_id found in wrangler.jsonc');
	}

	const mf = new Miniflare({
		script: 'export default { fetch: () => new Response("ok") }',
		modules: true,
		d1Databases: { DB: databaseId },
		r2Buckets: { MEDIA: 'stezora-publisher-media' },
		resourcePersistencePath: path.join(root, '.wrangler', 'state', 'v3'),
	});

	try {
		const db = await mf.getD1Database('DB');
		const bucket = await mf.getR2Bucket('MEDIA');

		const items = await fetchFeed();
		console.error(`neobook:sync: ${items.length} item(s) on the profile`);

		const { results: posts } = await db
			.prepare(
				'SELECT p.id, p.title, p.featured_image_id, p.content, pub.id AS publication_id, pub.slug AS publication_slug, p.slug ' +
					'FROM posts p JOIN publications pub ON pub.id = p.publication_id'
			)
			.all<PostRow>();
		const byTitle = new Map(posts.map((post) => [normalizeTitle(post.title), post]));

		const { results: tagRows } = await db
			.prepare('SELECT id, publication_id, slug FROM tags')
			.all<{ id: string; publication_id: string; slug: string }>();
		const tagIds = new Map(tagRows.map((tag) => [`${tag.publication_id}/${tag.slug}`, tag.id]));

		let contentUpdates = 0;
		let imagesAttached = 0;
		let postsCreated = 0;
		let tagsCreated = 0;
		const unmatched: string[] = [];

		for (const item of items) {
			if (item.type === 'book') {
				continue;
			}
			const normalized = normalizeTitle(item.title);
			// Direct match first: once a title update lands, the DB carries the
			// Neobook title and the alias points at a name that no longer exists.
			let post = byTitle.get(normalized) ?? byTitle.get(TITLE_ALIASES[normalized] ?? '');
			if (!post && NEW_POSTS[normalized]) {
				post = await createPost(db, NEW_POSTS[normalized], item);
				byTitle.set(normalized, post);
				postsCreated += 1;
				console.error(`  created: ${post.publication_slug}/${post.slug}`);
			}
			if (!post) {
				unmatched.push(`${item.type}: ${item.title}`);
				continue;
			}

			tagsCreated += await syncTags(db, post, item.tags ?? [], tagIds);

			// Neobook holds the current revision, so its title and content win
			// over the Blogger import. Slugs stay stable to keep URLs working.
			const title = item.title.replace(/\u00a0/g, ' ').trim();
			const titleChanged = title !== post.title;
			const contentChanged = htmlToComparableText(item.text) !== htmlToComparableText(post.content);
			if (titleChanged || contentChanged) {
				const updatedAt = neobookDateToIso(item.date_edit) ?? new Date().toISOString();
				const content = contentChanged ? neobookTextToHtml(item.text) : post.content;
				await db
					.prepare('UPDATE posts SET title = ?, content = ?, updated_at = ? WHERE id = ?')
					.bind(title, content, updatedAt, post.id)
					.run();
				contentUpdates += 1;
				const changes = [titleChanged ? `title -> ${title}` : '', contentChanged ? 'content' : '']
					.filter(Boolean)
					.join(', ');
				console.error(`  updated: ${post.publication_slug}/${post.slug} (${changes})`);
			}

			const imageUrl = item.attachment?.has === '1' ? item.attachment.image?.l : undefined;
			if (post.featured_image_id || !imageUrl) {
				continue;
			}

			const existing = await db
				.prepare('SELECT id FROM media WHERE post_id = ? AND source_url = ?')
				.bind(post.id, imageUrl)
				.first<{ id: string }>();
			let mediaId = existing?.id;

			if (!mediaId) {
				const download = await fetch(imageUrl);
				if (!download.ok) {
					console.error(`  FAIL image ${post.slug}: ${download.status} ${imageUrl}`);
					continue;
				}
				const bytes = new Uint8Array(await download.arrayBuffer());
				const suffix = mediaSuffix(item.attachment.id);
				mediaId = `m-p-${post.publication_slug}-${post.slug}-${suffix}`;
				const key = `localized/${mediaId}.jpg`;
				await bucket.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
				await db
					.prepare(
						'INSERT INTO media (id, post_id, publication_id, r2_key, source_url, filename, mime_type, size, created_at) ' +
							'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
					)
					.bind(
						mediaId,
						post.id,
						post.publication_id,
						key,
						imageUrl,
						`neobook-${suffix}.jpg`,
						'image/jpeg',
						bytes.byteLength,
						new Date().toISOString()
					)
					.run();
			}

			await db.prepare('UPDATE posts SET featured_image_id = ? WHERE id = ?').bind(mediaId, post.id).run();
			imagesAttached += 1;
			console.error(`  image: ${post.publication_slug}/${post.slug} <- ${mediaId}`);
		}

		console.error(
			`neobook:sync: ${postsCreated} post(s) created, ${contentUpdates} content update(s), ` +
				`${imagesAttached} featured image(s) attached, ${tagsCreated} tag(s) created`
		);
		if (unmatched.length > 0) {
			console.error(`neobook:sync: ${unmatched.length} item(s) with no matching post:`);
			for (const title of unmatched) {
				console.error(`  - ${title}`);
			}
		}
	} finally {
		await mf.dispose();
	}
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMain) {
	await main();
}

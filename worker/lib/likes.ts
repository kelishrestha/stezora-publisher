import { slugify } from '../../src/lib/publications';

/**
 * Like counts combine first-party likes (the `likes` table) with imported
 * integration likes (Neobook; Blogger exposes no likes). A visitor is
 * identified by the analytics cookie when present, else a cookieless daily hash
 * of IP + user agent, so a person likes an item at most once per day without a
 * new cookie or consent prompt.
 */

export type LikeEntity = 'post' | 'publication' | 'book';

export function isLikeEntity(value: string): value is LikeEntity {
	return value === 'post' || value === 'publication' || value === 'book';
}

function readCookie(request: Request, name: string): string | null {
	const match = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(request.headers.get('cookie') ?? '');
	return match ? decodeURIComponent(match[1]) : null;
}

async function sha256Hex(input: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Stable-ish visitor id: the analytics cookie if present, else a daily hash. */
export async function likeVisitorId(request: Request, env: Env): Promise<string> {
	const cookie = readCookie(request, 'sv_id');
	if (cookie) return `c-${cookie}`;
	const ip = request.headers.get('cf-connecting-ip') ?? '';
	const ua = request.headers.get('user-agent') ?? '';
	const salt = env.ANALYTICS_SALT ?? env.BETTER_AUTH_SECRET ?? 'likes';
	const day = new Date().toISOString().slice(0, 10);
	return `h-${(await sha256Hex(`${salt}:${day}:${ip}:${ua}`)).slice(0, 32)}`;
}

/** Imported (Neobook) likes for an entity; 0 when there is no match. */
export async function integrationLikes(db: D1Database, type: LikeEntity, id: string): Promise<number> {
	if (type === 'post') {
		const slash = id.indexOf('/');
		if (slash === -1) return 0;
		const publication = id.slice(0, slash);
		const post = id.slice(slash + 1);
		const row = await db
			.prepare('SELECT p.neobook_likes AS n FROM posts p JOIN publications pub ON pub.id = p.publication_id WHERE pub.slug = ? AND p.slug = ?')
			.bind(publication, post)
			.first<{ n: number | null }>();
		return Number(row?.n ?? 0);
	}
	if (type === 'publication') {
		const row = await db
			.prepare('SELECT coalesce(sum(p.neobook_likes), 0) AS n FROM posts p JOIN publications pub ON pub.id = p.publication_id WHERE pub.slug = ?')
			.bind(id)
			.first<{ n: number | null }>();
		return Number(row?.n ?? 0);
	}
	// book: match the public slug against the imported book titles.
	const { results } = await db.prepare('SELECT title, likes FROM books').all<{ title: string; likes: number | null }>();
	const match = results.find((book) => slugify(book.title) === id);
	return Number(match?.likes ?? 0);
}

async function appLikeCount(db: D1Database, type: LikeEntity, id: string): Promise<number> {
	const row = await db.prepare('SELECT count(*) AS n FROM likes WHERE entity_type = ? AND entity_id = ?').bind(type, id).first<{ n: number }>();
	return Number(row?.n ?? 0);
}

export interface LikeSummary {
	app: number;
	integration: number;
	total: number;
	liked: boolean;
}

export async function likeSummary(db: D1Database, type: LikeEntity, id: string, visitorId: string): Promise<LikeSummary> {
	const [app, integration, mine] = await Promise.all([
		appLikeCount(db, type, id),
		integrationLikes(db, type, id),
		db.prepare('SELECT 1 AS x FROM likes WHERE entity_type = ? AND entity_id = ? AND visitor_id = ?').bind(type, id, visitorId).first<{ x: number }>(),
	]);
	return { app, integration, total: app + integration, liked: Boolean(mine) };
}

/** Toggles the visitor's like and returns the fresh summary. */
export async function toggleLike(db: D1Database, type: LikeEntity, id: string, visitorId: string): Promise<LikeSummary> {
	const existing = await db.prepare('SELECT id FROM likes WHERE entity_type = ? AND entity_id = ? AND visitor_id = ?').bind(type, id, visitorId).first<{ id: string }>();
	if (existing) {
		await db.prepare('DELETE FROM likes WHERE id = ?').bind(existing.id).run();
	} else {
		await db
			.prepare('INSERT OR IGNORE INTO likes (id, entity_type, entity_id, visitor_id, created_at) VALUES (?, ?, ?, ?, ?)')
			.bind(`lk-${crypto.randomUUID()}`, type, id, visitorId, new Date().toISOString())
			.run();
	}
	return likeSummary(db, type, id, visitorId);
}

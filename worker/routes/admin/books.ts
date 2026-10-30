import { desc, sql } from 'drizzle-orm';
import { createDb } from '../../db/client';
import { books } from '../../db/schema';
import { fail, ok } from '../../lib/http';
import type { AuthenticatedHandler } from '../../lib/middleware';

/**
 * GET /api/admin/books
 * Lists the standalone works imported from Neobook, newest first.
 */
export const listBooks: AuthenticatedHandler = async ({ env }) => {
	const rows = await createDb(env.DB)
		.select()
		.from(books)
		.orderBy(desc(sql`coalesce(${books.published_at}, ${books.created_at})`));
	return ok({ books: rows });
};

// Hosts whose images the admin image proxy will fetch (book covers live on the
// Neobook CDN; the others cover imported post media).
const ALLOWED_IMAGE_HOSTS = ['s3.twcstorage.ru', 'blogger.googleusercontent.com', 'images.unsplash.com'];

/**
 * GET /api/admin/remote-image?src=<url>
 * Streams an allowlisted external image through the app so admin pages (for
 * example the Books covers) are served from our own domain instead of hotlinking.
 */
export const remoteImage: AuthenticatedHandler = async ({ env, request }) => {
	void env;
	const src = new URL(request.url).searchParams.get('src');
	let target: URL;
	try {
		target = new URL(src ?? '');
	} catch {
		return fail('bad_request', 'A valid src URL is required.', 400);
	}
	if (target.protocol !== 'https:' || !ALLOWED_IMAGE_HOSTS.includes(target.hostname)) {
		return fail('forbidden', 'That image host is not allowed.', 403);
	}
	const upstream = await fetch(target.toString());
	if (!upstream.ok) {
		return new Response(null, { status: 502 });
	}
	const headers = new Headers();
	headers.set('content-type', upstream.headers.get('content-type') ?? 'image/jpeg');
	headers.set('cache-control', 'public, max-age=86400');
	headers.set('x-content-type-options', 'nosniff');
	return new Response(upstream.body, { headers });
};

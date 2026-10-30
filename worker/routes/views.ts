import { and, count, eq } from 'drizzle-orm';
import { createDb } from '../db/client';
import { pageViews } from '../db/schema';
import type { RouteHandler } from '../router';

/**
 * GET /api/views/:publication/:post
 *
 * Public per-post view count for the on-page badge (the first-party replacement
 * for a third-party counter widget). Lightly cached so the badge stays cheap.
 */
export const postViews: RouteHandler = async ({ env, params }) => {
	const db = createDb(env.DB);
	const rows = await db
		.select({ views: count() })
		.from(pageViews)
		.where(and(eq(pageViews.publication_slug, params.publication), eq(pageViews.post_slug, params.post)));

	return new Response(JSON.stringify({ views: rows[0]?.views ?? 0 }), {
		status: 200,
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'cache-control': 'public, max-age=60',
		},
	});
};

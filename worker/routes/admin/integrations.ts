import { asc, eq, sql } from 'drizzle-orm';
import { createDb } from '../../db/client';
import { bloggerStats, books, posts, publications } from '../../db/schema';
import { ok } from '../../lib/http';
import { readBloggerRefreshToken } from '../../lib/blogger-import';
import type { AuthenticatedHandler } from '../../lib/middleware';

/**
 * GET /api/admin/integrations
 *
 * Read-only status for the app's integrations. Blogger linkage is derived from
 * imported posts in D1 (blog host and how many posts are linked), plus whether
 * the OAuth credentials are configured on the server and the latest pageview
 * snapshot. Neobook is a public one-way sync (no credentials) and reports its
 * profile and how many books have been imported.
 */
function hostOf(url: string | null): string | null {
	if (!url) return null;
	try {
		return new URL(url).hostname;
	} catch {
		return null;
	}
}

export const integrations: AuthenticatedHandler = async ({ env }) => {
	const db = createDb(env.DB);

	const rows = await db
		.select({
			id: publications.id,
			slug: publications.slug,
			name: publications.name,
			linked: sql<number>`sum(case when ${posts.blogger_post_id} is not null then 1 else 0 end)`,
			sampleUrl: sql<string | null>`max(${posts.canonical_url})`,
		})
		.from(publications)
		.leftJoin(posts, eq(posts.publication_id, publications.id))
		.groupBy(publications.id)
		.orderBy(asc(publications.slug));

	const statsRows = await db.select().from(bloggerStats);
	const statsByPublication = new Map(statsRows.map((row) => [row.publication_id, row]));

	const bloggerPublications = rows.map((row) => {
		const stats = statsByPublication.get(row.id);
		return {
			slug: row.slug,
			name: row.name,
			blogHost: hostOf(row.sampleUrl),
			linkedPosts: Number(row.linked ?? 0),
			stats: stats
				? { viewsAll: stats.views_all, views30d: stats.views_30d, views7d: stats.views_7d, fetchedAt: stats.fetched_at }
				: null,
		};
	});

	// Client id/secret are env secrets; the refresh token may come from the
	// in-UI OAuth flow (stored in D1) or the env secret. "canAuthorize" gates the
	// Authorize button; "configured" means a Blogger call can actually run.
	const canAuthorize = Boolean(env.BLOGGER_CLIENT_ID && env.BLOGGER_CLIENT_SECRET);
	const hasRefreshToken = Boolean((await readBloggerRefreshToken(env.DB)) ?? env.BLOGGER_REFRESH_TOKEN);
	const bloggerConfigured = canAuthorize && hasRefreshToken;

	const [bookCount] = await db.select({ count: sql<number>`count(*)` }).from(books);

	return ok({
		// Read-only: the schedule is fixed in wrangler.jsonc "triggers.crons".
		// Keep this in sync with that cron expression.
		automation: {
			schedule: '0 2 * * *',
			cadence: 'Daily at 02:00 UTC',
			description: 'Refreshes Blogger statistics, syncs Neobook, and records a source snapshot for the audience trend.',
		},
		blogger: {
			connected: bloggerPublications.some((publication) => publication.linkedPosts > 0),
			configured: bloggerConfigured,
			canAuthorize,
			publications: bloggerPublications,
		},
		neobook: {
			// The Neobook feed is a public endpoint, so the sync needs no secrets.
			configured: true,
			profileUrl: 'https://neobook.org/stezora/',
			books: Number(bookCount?.count ?? 0),
		},
	});
};

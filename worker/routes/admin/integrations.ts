import { asc, eq, sql } from 'drizzle-orm';
import { createDb } from '../../db/client';
import { posts, publications } from '../../db/schema';
import { ok } from '../../lib/http';
import type { AuthenticatedHandler } from '../../lib/middleware';

/**
 * GET /api/admin/integrations
 *
 * Read-only status for the app's integrations. Blogger linkage is derived from
 * imported posts in D1 (blog id, blog host, and how many posts are linked);
 * the import itself runs from the CLI. Neobook is a one-way CLI sync with no D1
 * footprint, so only its profile is reported.
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
			slug: publications.slug,
			name: publications.name,
			linked: sql<number>`sum(case when ${posts.blogger_post_id} is not null then 1 else 0 end)`,
			sampleUrl: sql<string | null>`max(${posts.canonical_url})`,
		})
		.from(publications)
		.leftJoin(posts, eq(posts.publication_id, publications.id))
		.groupBy(publications.id)
		.orderBy(asc(publications.slug));

	const bloggerPublications = rows.map((row) => ({
		slug: row.slug,
		name: row.name,
		blogHost: hostOf(row.sampleUrl),
		linkedPosts: Number(row.linked ?? 0),
	}));

	return ok({
		blogger: {
			connected: bloggerPublications.some((publication) => publication.linkedPosts > 0),
			publications: bloggerPublications,
		},
		neobook: {
			profileUrl: 'https://neobook.org/stezora/',
		},
	});
};

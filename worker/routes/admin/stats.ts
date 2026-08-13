import { asc, count, desc, eq, sql } from 'drizzle-orm';
import { createDb } from '../../db/client';
import { media, posts, publications } from '../../db/schema';
import { ok } from '../../lib/http';
import type { AuthenticatedHandler } from '../../lib/middleware';

interface PublicationStats {
	slug: string;
	name: string;
	draft: number;
	scheduled: number;
	published: number;
	archived: number;
}

interface RecentPost {
	id: string;
	title: string;
	slug: string;
	publication: string;
	status: string;
	publishedAt: string | null;
}

const EMPTY_STATUSES = { draft: 0, scheduled: 0, published: 0, archived: 0 };

/**
 * GET /api/admin/stats
 *
 * Posts per status per publication, total media, and the most recently
 * touched posts. Counts are publication-scoped and statuses are kept separate
 * (a draft is never conflated with a published post).
 */
export const adminStats: AuthenticatedHandler = async ({ env }) => {
	const db = createDb(env.DB);

	const [publicationsResult, statusCounts, mediaResult, recentPosts] = await Promise.all([
		db
			.select({ slug: publications.slug, name: publications.name })
			.from(publications)
			.orderBy(asc(publications.slug)),
		db
			.select({
				slug: publications.slug,
				status: posts.status,
				posts: count(posts.id),
			})
			.from(posts)
			.innerJoin(publications, eq(posts.publication_id, publications.id))
			.groupBy(posts.publication_id, posts.status)
			.orderBy(asc(publications.slug)),
		db.select({ total: count() }).from(media),
		db
			.select({
				id: posts.id,
				title: posts.title,
				slug: posts.slug,
				publication: publications.slug,
				status: posts.status,
				publishedAt: posts.published_at,
			})
			.from(posts)
			.innerJoin(publications, eq(posts.publication_id, publications.id))
			.orderBy(desc(sql`coalesce(${posts.updated_at}, ${posts.created_at})`))
			.limit(10),
	]);

	const countsBySlug = new Map<string, Partial<Record<string, number>>>();
	for (const row of statusCounts) {
		const status = row.status ?? 'draft';
		const entry = countsBySlug.get(row.slug) ?? {};
		entry[status] = (entry[status] ?? 0) + row.posts;
		countsBySlug.set(row.slug, entry);
	}

	const publicationsStats: PublicationStats[] = publicationsResult.map((publication) => {
		const counts = countsBySlug.get(publication.slug) ?? {};
		return {
			...EMPTY_STATUSES,
			slug: publication.slug,
			name: publication.name,
			draft: counts.draft ?? 0,
			scheduled: counts.scheduled ?? 0,
			published: counts.published ?? 0,
			archived: counts.archived ?? 0,
		};
	});

	return ok({
		publications: publicationsStats,
		totalMedia: mediaResult[0]?.total ?? 0,
		recentPosts: recentPosts as RecentPost[],
	});
};

import { asc, count, eq, sql, sum } from 'drizzle-orm';
import { createDb } from '../../db/client';
import { media, posts, publications } from '../../db/schema';
import { ok } from '../../lib/http';
import type { AuthenticatedHandler } from '../../lib/middleware';

interface StatusByPublication {
	slug: string;
	name: string;
	draft: number;
	scheduled: number;
	published: number;
	archived: number;
}

interface MonthPoint {
	/** `YYYY-MM`. */
	month: string;
	count: number;
}

const EMPTY_STATUSES = { draft: 0, scheduled: 0, published: 0, archived: 0 };

/**
 * GET /api/admin/analytics
 *
 * Writer's Analytics aggregates, all derived from content metadata (there is
 * no traffic data): posts per status per publication, the monthly publishing
 * cadence from `published_at`, and the media storage split (R2-localized vs
 * external). Counts are computed in SQL so the payload stays small.
 */
export const analytics: AuthenticatedHandler = async ({ env }) => {
	const db = createDb(env.DB);

	const month = sql<string>`substr(${posts.published_at}, 1, 7)`;

	const [publicationsResult, statusCounts, cadenceRows, mediaRow, totalsRow] = await Promise.all([
		db
			.select({ slug: publications.slug, name: publications.name })
			.from(publications)
			.orderBy(asc(publications.slug)),
		db
			.select({ slug: publications.slug, status: posts.status, posts: count(posts.id) })
			.from(posts)
			.innerJoin(publications, eq(posts.publication_id, publications.id))
			.groupBy(posts.publication_id, posts.status)
			.orderBy(asc(publications.slug)),
		db
			.select({ month, count: count(posts.id) })
			.from(posts)
			.where(sql`${posts.status} = 'published' AND ${posts.published_at} IS NOT NULL`)
			.groupBy(month)
			.orderBy(asc(month)),
		db
			.select({
				total: count(),
				localized: count(media.r2_key),
				totalBytes: sum(media.size),
			})
			.from(media),
		db
			.select({
				totalPosts: count(posts.id),
				published: sql<number>`sum(case when ${posts.status} = 'published' then 1 else 0 end)`,
				firstPublished: sql<string | null>`min(case when ${posts.status} = 'published' then ${posts.published_at} end)`,
				lastPublished: sql<string | null>`max(case when ${posts.status} = 'published' then ${posts.published_at} end)`,
			})
			.from(posts),
	]);

	const countsBySlug = new Map<string, Partial<Record<string, number>>>();
	for (const row of statusCounts) {
		const status = row.status ?? 'draft';
		const entry = countsBySlug.get(row.slug) ?? {};
		entry[status] = (entry[status] ?? 0) + row.posts;
		countsBySlug.set(row.slug, entry);
	}

	const statusByPublication: StatusByPublication[] = publicationsResult.map((publication) => {
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

	const postsByMonth: MonthPoint[] = cadenceRows
		.filter((row): row is { month: string; count: number } => Boolean(row.month))
		.map((row) => ({ month: row.month, count: row.count }));

	const totalMedia = mediaRow[0]?.total ?? 0;
	const localizedMedia = mediaRow[0]?.localized ?? 0;
	const totalBytes = Number(mediaRow[0]?.totalBytes ?? 0);

	return ok({
		totals: {
			publications: publicationsResult.length,
			posts: totalsRow[0]?.totalPosts ?? 0,
			published: Number(totalsRow[0]?.published ?? 0),
			firstPublished: totalsRow[0]?.firstPublished ?? null,
			lastPublished: totalsRow[0]?.lastPublished ?? null,
		},
		statusByPublication,
		postsByMonth,
		media: {
			total: totalMedia,
			localized: localizedMedia,
			external: totalMedia - localizedMedia,
			totalBytes,
		},
	});
};

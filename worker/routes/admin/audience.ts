import { type SQL, and, asc, count, countDistinct, desc, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { createDb } from '../../db/client';
import { bloggerStats, books, pageViews, posts, publications, sourceStats } from '../../db/schema';
import { ok } from '../../lib/http';
import { sourceTotals } from '../../lib/source-stats';
import type { AuthenticatedHandler } from '../../lib/middleware';

/**
 * GET /api/admin/audience?days=30&publication=<slug>&post=<slug>
 *
 * First-party visitor analytics aggregated from `page_views`. Optional
 * `publication` and `post` scope every aggregate to one publication or one
 * post, powering the per-publication breakdown and the per-post "Stats" view.
 *
 * Unique visitors use two identifiers: `visitor_hash` (daily-rotated,
 * cookieless) for per-day uniques, and `visitor_id` (stable cookie, consented)
 * for the all-time unique total.
 */
export const audience: AuthenticatedHandler = async ({ env, request }) => {
	const url = new URL(request.url);
	const days = Math.min(Math.max(Math.trunc(Number(url.searchParams.get('days') ?? 30)) || 30, 1), 365);
	const publication = url.searchParams.get('publication') || undefined;
	const post = url.searchParams.get('post') || undefined;

	const db = createDb(env.DB);
	const now = Date.now();
	const sinceIso = new Date(now - days * 86_400_000).toISOString();
	const since24hIso = new Date(now - 86_400_000).toISOString();
	const day = sql<string>`substr(${pageViews.created_at}, 1, 10)`;
	const hour = sql<string>`substr(${pageViews.created_at}, 1, 13)`;

	// Scope conditions shared by every query. `post` implies its publication.
	const scope: SQL[] = [];
	if (publication) scope.push(eq(pageViews.publication_slug, publication));
	if (post) scope.push(eq(pageViews.post_slug, post));

	const within = (...extra: SQL[]) => and(gte(pageViews.created_at, sinceIso), ...scope, ...extra);
	const allTime = scope.length ? and(...scope) : undefined;

	const [totalsRow, last24Row, byDay, byHour, topCountries, topReferrers, topPublications, topPosts, recentVisits] = await Promise.all([
		db.select({ pageviews: count(), visitors: countDistinct(pageViews.visitor_id) }).from(pageViews).where(allTime),
		db
			.select({ pageviews: count(), visitors: countDistinct(pageViews.visitor_hash) })
			.from(pageViews)
			.where(and(gte(pageViews.created_at, since24hIso), ...scope)),
		db.select({ day, views: count(), visitors: countDistinct(pageViews.visitor_hash) }).from(pageViews).where(within()).groupBy(day).orderBy(day),
		db
			.select({ hour, views: count(), visitors: countDistinct(pageViews.visitor_hash) })
			.from(pageViews)
			.where(and(gte(pageViews.created_at, since24hIso), ...scope))
			.groupBy(hour)
			.orderBy(hour),
		db
			.select({ country: pageViews.country, views: count() })
			.from(pageViews)
			.where(within(isNotNull(pageViews.country)))
			.groupBy(pageViews.country)
			.orderBy(desc(count()))
			.limit(10),
		db
			.select({ host: pageViews.referrer_host, views: count() })
			.from(pageViews)
			.where(within(isNotNull(pageViews.referrer_host)))
			.groupBy(pageViews.referrer_host)
			.orderBy(desc(count()))
			.limit(10),
		db
			.select({ publication: pageViews.publication_slug, name: publications.name, views: count() })
			.from(pageViews)
			.leftJoin(publications, eq(publications.slug, pageViews.publication_slug))
			.where(within(isNotNull(pageViews.publication_slug)))
			.groupBy(pageViews.publication_slug)
			.orderBy(desc(count()))
			.limit(10),
		db
			.select({ publication: pageViews.publication_slug, slug: pageViews.post_slug, title: posts.title, views: count() })
			.from(pageViews)
			.leftJoin(publications, eq(publications.slug, pageViews.publication_slug))
			.leftJoin(posts, and(eq(posts.publication_id, publications.id), eq(posts.slug, pageViews.post_slug)))
			.where(within(isNotNull(pageViews.post_slug)))
			.groupBy(pageViews.publication_slug, pageViews.post_slug)
			.orderBy(desc(count()))
			.limit(10),
		db
			.select({
				createdAt: pageViews.created_at,
				path: pageViews.path,
				country: pageViews.country,
				region: pageViews.region,
				city: pageViews.city,
				device: pageViews.device,
				referrerHost: pageViews.referrer_host,
			})
			.from(pageViews)
			.where(allTime)
			.orderBy(desc(pageViews.created_at))
			.limit(20),
	]);

	// Cross-source data (unscoped by publication/post, which are first-party
	// concepts). Powers the source dropdown, the comparison, and the trend.
	const [sources, historyRows, bloggerPublications, neobookPosts, neobookBooks] = await Promise.all([
		sourceTotals(env.DB),
		db.select().from(sourceStats).orderBy(asc(sourceStats.captured_at)),
		db
			.select({ slug: publications.slug, name: publications.name, viewsAll: bloggerStats.views_all, views30d: bloggerStats.views_30d, views7d: bloggerStats.views_7d })
			.from(bloggerStats)
			.innerJoin(publications, eq(publications.id, bloggerStats.publication_id))
			.orderBy(desc(bloggerStats.views_all)),
		db
			.select({ title: posts.title, publication: publications.slug, slug: posts.slug, views: posts.neobook_views, likes: posts.neobook_likes, comments: posts.neobook_comments })
			.from(posts)
			.innerJoin(publications, eq(publications.id, posts.publication_id))
			.where(isNotNull(posts.neobook_url))
			.orderBy(desc(posts.neobook_views))
			.limit(50),
		db
			.select({ title: books.title, views: books.views, likes: books.likes, comments: books.comments, linkUrl: books.link_url })
			.from(books)
			.orderBy(desc(books.views)),
	]);

	// When scoped to one post, its own cross-source figures: first-party views
	// come from `totals`, Neobook carries per-poem engagement, and Blogger only
	// offers a link (no per-post count exists in its API).
	let postSource: {
		source: string | null;
		neobookUrl: string | null;
		neobookViews: number | null;
		neobookLikes: number | null;
		neobookComments: number | null;
		bloggerUrl: string | null;
	} | null = null;
	if (publication && post) {
		const row = await db
			.select({
				source: posts.source,
				neobookUrl: posts.neobook_url,
				neobookViews: posts.neobook_views,
				neobookLikes: posts.neobook_likes,
				neobookComments: posts.neobook_comments,
				bloggerUrl: posts.canonical_url,
			})
			.from(posts)
			.innerJoin(publications, eq(publications.id, posts.publication_id))
			.where(and(eq(publications.slug, publication), eq(posts.slug, post)))
			.limit(1);
		postSource = row[0] ?? null;
	}

	return ok({
		days,
		sources,
		postSource,
		sourceHistory: historyRows.map((row) => ({ capturedAt: row.captured_at, app: row.app_views, blogger: row.blogger_views, neobook: row.neobook_views })),
		bloggerPublications,
		neobookPosts,
		neobookBooks,
		scope: {
			publication: publication ?? null,
			post: post ?? null,
			publicationName: topPublications.find((row) => row.publication === publication)?.name ?? publication ?? null,
			postTitle: post ? topPosts.find((row) => row.slug === post)?.title ?? post : null,
		},
		totals: {
			pageviews: totalsRow[0]?.pageviews ?? 0,
			visitors: totalsRow[0]?.visitors ?? 0,
			last24hPageviews: last24Row[0]?.pageviews ?? 0,
			last24hVisitors: last24Row[0]?.visitors ?? 0,
		},
		viewsByDay: byDay,
		viewsByHour: byHour,
		topCountries,
		topReferrers,
		topPublications,
		topPosts,
		recentVisits,
	});
};

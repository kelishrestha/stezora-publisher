import { createDb } from '../db/client';
import { bloggerStats, bloggerSync, books, likes, media, pageViews, posts, postTags, publications, sourceStats, tags, testimonials } from '../db/schema';
import { toCsv } from '../lib/csv';
import { ApiError } from '../lib/errors';
import { authenticateSession } from '../lib/middleware';
import type { AuthenticatedContext, AuthenticatedHandler } from '../lib/middleware';
import { zip, type ZipEntry } from '../lib/zip';
import type { RouteHandler } from '../router';
import { analytics } from './admin/analytics';
import { audience } from './admin/audience';

/**
 * Compares two strings in constant time so the backup token check cannot be
 * narrowed by a timing side-channel. Both sides are hashed to a fixed-length
 * digest first, so neither the comparison time nor the digest length reveals
 * anything about the secret's length.
 */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
	const encoder = new TextEncoder();
	const [digestA, digestB] = await Promise.all([
		crypto.subtle.digest('SHA-256', encoder.encode(a)),
		crypto.subtle.digest('SHA-256', encoder.encode(b)),
	]);
	const viewA = new Uint8Array(digestA);
	const viewB = new Uint8Array(digestB);
	let mismatch = 0;
	for (let i = 0; i < viewA.length; i += 1) {
		mismatch |= viewA[i] ^ viewB[i];
	}
	return mismatch === 0;
}

interface SourceTotals {
	app: number;
	blogger: number;
	neobook: number;
}

interface AudienceData {
	totals: { pageviews: number; visitors: number; last24hPageviews: number; last24hVisitors: number };
	sources: SourceTotals;
	sourceHistory: Array<Record<string, unknown>>;
	bloggerPublications: Array<Record<string, unknown>>;
	neobookPosts: Array<Record<string, unknown>>;
	neobookBooks: Array<Record<string, unknown>>;
	viewsByDay: Array<Record<string, unknown>>;
	viewsByHour: Array<Record<string, unknown>>;
	topCountries: Array<Record<string, unknown>>;
	topReferrers: Array<Record<string, unknown>>;
	topPublications: Array<Record<string, unknown>>;
	topPosts: Array<Record<string, unknown>>;
	recentVisits: Array<Record<string, unknown>>;
}

interface AnalyticsData {
	totals: { publications: number; posts: number; published: number; firstPublished: string | null; lastPublished: string | null };
	statusByPublication: Array<Record<string, unknown>>;
	postsByMonth: Array<Record<string, unknown>>;
	media: { total: number; localized: number; external: number; totalBytes: number };
}

/** Runs an admin handler internally and returns its unwrapped `data` payload. */
async function handlerData<T>(handler: AuthenticatedHandler, env: Env, ctx: ExecutionContext, path: string): Promise<T> {
	const context: AuthenticatedContext = {
		request: new Request(`http://localhost${path}`),
		env,
		ctx,
		params: {},
		user: { id: 'backup', email: '', role: 'admin' },
	};
	const response = await handler(context);
	const body = (await response.json()) as { success: boolean; data: T };
	return body.data;
}

/**
 * GET /api/export
 *
 * Full-fidelity backup bundle, delivered as a ZIP so each slice lands in its
 * own file. `data/*.json` are the raw rows (drafts and all, nothing
 * sanitized) for a lossless restore; `audience/*.csv` and `analytics/*.csv`
 * are the computed breakdowns ready to open in a spreadsheet. Auth accepts
 * either an admin session (manual use) or `Authorization: Bearer
 * <BACKUP_TOKEN>` (the CI backup job). Auth tables and app_settings (which
 * holds the Blogger refresh token) are deliberately excluded; the SQL dump
 * layer covers those.
 */
export const exportAll: RouteHandler = async ({ request, env, ctx }) => {
	const bearer = request.headers.get('authorization');
	const token = env.BACKUP_TOKEN;
	const bearerOk = Boolean(token && bearer && (await timingSafeEqual(bearer, `Bearer ${token}`)));
	if (!bearerOk) {
		const user = await authenticateSession(request, env);
		if (!user) {
			throw new ApiError(401, 'UNAUTHORIZED', 'Authentication required.');
		}
	}

	const db = createDb(env.DB);
	const [
		publicationRows,
		postRows,
		tagRows,
		postTagRows,
		mediaRows,
		bloggerSyncRows,
		bookRows,
		bloggerStatsRows,
		sourceStatsRows,
		testimonialRows,
		likeRows,
		pageViewRows,
		audienceData,
		analyticsData,
	] = await Promise.all([
		db.select().from(publications),
		db.select().from(posts),
		db.select().from(tags),
		db.select().from(postTags),
		db.select().from(media),
		db.select().from(bloggerSync),
		db.select().from(books),
		db.select().from(bloggerStats),
		db.select().from(sourceStats),
		db.select().from(testimonials),
		db.select().from(likes),
		db.select().from(pageViews),
		handlerData<AudienceData>(audience, env, ctx, '/api/admin/audience?days=365'),
		handlerData<AnalyticsData>(analytics, env, ctx, '/api/admin/analytics'),
	]);

	const exportedAt = new Date().toISOString();

	// Raw table rows: lossless JSON for a restore.
	const data: Record<string, unknown[]> = {
		publications: publicationRows,
		posts: postRows,
		tags: tagRows,
		'post-tags': postTagRows,
		media: mediaRows,
		'blogger-sync': bloggerSyncRows,
		books: bookRows,
		'blogger-stats': bloggerStatsRows,
		'source-stats': sourceStatsRows,
		testimonials: testimonialRows,
		likes: likeRows,
		'page-views': pageViewRows,
	};

	// Audience breakdowns: one CSV per view, mirroring the audience dashboard.
	const audienceFiles: Record<string, Array<Record<string, unknown>>> = {
		totals: [audienceData.totals],
		sources: [{ app: audienceData.sources.app, blogger: audienceData.sources.blogger, neobook: audienceData.sources.neobook }],
		'source-history': audienceData.sourceHistory,
		'views-by-day': audienceData.viewsByDay,
		'views-by-hour': audienceData.viewsByHour,
		'top-countries': audienceData.topCountries,
		'top-referrers': audienceData.topReferrers,
		'top-publications': audienceData.topPublications,
		'top-posts': audienceData.topPosts,
		'recent-visits': audienceData.recentVisits,
		'blogger-publications': audienceData.bloggerPublications,
		'neobook-posts': audienceData.neobookPosts,
		'neobook-books': audienceData.neobookBooks,
	};

	// Analytics breakdowns: the writer's-analytics aggregates.
	const analyticsFiles: Record<string, Array<Record<string, unknown>>> = {
		totals: [analyticsData.totals],
		'status-by-publication': analyticsData.statusByPublication,
		'posts-by-month': analyticsData.postsByMonth,
		media: [analyticsData.media],
	};

	const entries: ZipEntry[] = [];
	const counts: Record<string, number> = {};
	for (const [name, rows] of Object.entries(data)) {
		counts[name] = rows.length;
		entries.push({ name: `data/${name}.json`, data: JSON.stringify(rows, null, 2) });
	}
	for (const [name, rows] of Object.entries(audienceFiles)) {
		entries.push({ name: `audience/${name}.csv`, data: toCsv(rows) });
	}
	for (const [name, rows] of Object.entries(analyticsFiles)) {
		entries.push({ name: `analytics/${name}.csv`, data: toCsv(rows) });
	}

	const manifest = {
		schema: 'stezora-export/3',
		exportedAt,
		note: 'Auth tables and app_settings (Blogger refresh token) are excluded by design; the SQL dump layer covers those.',
		counts,
		files: entries.map((entry) => entry.name).sort(),
	};
	entries.unshift({ name: 'manifest.json', data: JSON.stringify(manifest, null, 2) });

	const archive = zip(entries);
	const filename = `stezora-export-${exportedAt.slice(0, 10)}.zip`;
	// Copy into a standalone ArrayBuffer so the body is a clean BodyInit.
	const body = archive.slice().buffer;
	return new Response(body, {
		status: 200,
		headers: {
			'content-type': 'application/zip',
			'content-disposition': `attachment; filename="${filename}"`,
			'cache-control': 'no-store',
		},
	});
};

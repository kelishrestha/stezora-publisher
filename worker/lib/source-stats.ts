/**
 * Cross-source view totals and the timestamped history that backs the audience
 * page's multi-source trend. "app" is first-party pageviews; "blogger" is the
 * sum of blog-level all-time totals; "neobook" is poem plus book view counts.
 */

export interface SourceTotals {
	app: number;
	blogger: number;
	neobook: number;
}

export async function sourceTotals(db: D1Database): Promise<SourceTotals> {
	const [app, blogger, neobookPosts, neobookBooks] = await Promise.all([
		db.prepare('SELECT count(*) AS n FROM page_views').first<{ n: number }>(),
		db.prepare('SELECT coalesce(sum(views_all), 0) AS n FROM blogger_stats').first<{ n: number }>(),
		db.prepare('SELECT coalesce(sum(neobook_views), 0) AS n FROM posts').first<{ n: number }>(),
		db.prepare('SELECT coalesce(sum(views), 0) AS n FROM books').first<{ n: number }>(),
	]);
	return {
		app: Number(app?.n ?? 0),
		blogger: Number(blogger?.n ?? 0),
		neobook: Number(neobookPosts?.n ?? 0) + Number(neobookBooks?.n ?? 0),
	};
}

/** Keep at most this many snapshots so the history (and trend query) stays bounded. */
const MAX_SNAPSHOTS = 365;

/** Appends (or replaces, same timestamp) a snapshot of all three source totals. */
export async function captureSourceSnapshot(db: D1Database): Promise<void> {
	const totals = await sourceTotals(db);
	const now = new Date().toISOString();
	await db
		.prepare(
			'INSERT INTO source_stats (captured_at, app_views, blogger_views, neobook_views) VALUES (?, ?, ?, ?) ' +
				'ON CONFLICT (captured_at) DO UPDATE SET app_views = excluded.app_views, blogger_views = excluded.blogger_views, neobook_views = excluded.neobook_views'
		)
		.bind(now, totals.app, totals.blogger, totals.neobook)
		.run();
	// Trim the oldest rows beyond the cap (keeps the trend unbounded-growth free).
	await db
		.prepare('DELETE FROM source_stats WHERE captured_at NOT IN (SELECT captured_at FROM source_stats ORDER BY captured_at DESC LIMIT ?)')
		.bind(MAX_SNAPSHOTS)
		.run();
}

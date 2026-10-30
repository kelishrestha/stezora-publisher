import { BloggerNotConfiguredError, refreshBloggerStats, resolveBloggerCredentials } from './lib/blogger-import';
import { syncNeobook } from './lib/neobook';
import { captureSourceSnapshot } from './lib/source-stats';

/**
 * Daily cron job: refresh Blogger pageview stats and sync Neobook, then record
 * one combined source snapshot so the audience trend advances each day without
 * anyone clicking. Each step is isolated so one failure does not block the rest,
 * and the snapshot is taken once at the end (the steps skip their own capture).
 */
export async function runDailySync(env: Env): Promise<void> {
	try {
		await refreshBloggerStats(env.DB, await resolveBloggerCredentials(env.DB, env), { snapshot: false });
	} catch (error) {
		if (!(error instanceof BloggerNotConfiguredError)) {
			console.error('scheduled_blogger_stats_failed', { message: error instanceof Error ? error.message : String(error) });
		}
	}

	try {
		await syncNeobook(env.DB, env.MEDIA, { snapshot: false });
	} catch (error) {
		console.error('scheduled_neobook_sync_failed', { message: error instanceof Error ? error.message : String(error) });
	}

	await captureSourceSnapshot(env.DB);
}

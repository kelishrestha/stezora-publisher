import { z } from 'zod';
import { fail, ok } from '../../lib/http';
import { readJsonBody } from '../../lib/validate';
import { BloggerNotConfiguredError, importBlogger, refreshBloggerStats } from '../../lib/blogger-import';
import type { AuthenticatedHandler } from '../../lib/middleware';

const importPayload = z.object({ includeDrafts: z.boolean().default(false) });

function bloggerCredentials(env: Env) {
	return { clientId: env.BLOGGER_CLIENT_ID, clientSecret: env.BLOGGER_CLIENT_SECRET, refreshToken: env.BLOGGER_REFRESH_TOKEN };
}

/**
 * POST /api/admin/blogger/import
 * Imports posts from the linked Blogger blogs into D1. Body: { includeDrafts }.
 * Returns a per-publication summary. New content shows in the CMS immediately;
 * the public site reflects it on the next build and deploy.
 */
export const bloggerImport: AuthenticatedHandler = async ({ env, request }) => {
	const { includeDrafts } = importPayload.parse(await readJsonBody(request));
	try {
		const summary = await importBlogger(env.DB, bloggerCredentials(env), { includeDrafts });
		return ok(summary);
	} catch (error) {
		if (error instanceof BloggerNotConfiguredError) {
			return fail('blogger_not_configured', error.message, 400);
		}
		return fail('blogger_import_failed', error instanceof Error ? error.message : 'Blogger import failed.', 502);
	}
};

/**
 * POST /api/admin/blogger/stats
 * Refreshes the Blogger blog-level pageview totals for every linked blog.
 */
export const bloggerStats: AuthenticatedHandler = async ({ env }) => {
	try {
		const summary = await refreshBloggerStats(env.DB, bloggerCredentials(env));
		return ok(summary);
	} catch (error) {
		if (error instanceof BloggerNotConfiguredError) {
			return fail('blogger_not_configured', error.message, 400);
		}
		const message = error instanceof Error ? error.message : 'Could not refresh Blogger statistics.';
		if (/ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient/i.test(message)) {
			return fail('blogger_scope_insufficient', 'The Blogger credentials cannot read pageviews. Re-authorize with the full blogger scope (pnpm blogger:oauth) and update the refresh token.', 403);
		}
		return fail('blogger_stats_failed', message, 502);
	}
};

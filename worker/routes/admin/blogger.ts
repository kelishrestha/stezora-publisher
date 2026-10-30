import { z } from 'zod';
import { fail, ok } from '../../lib/http';
import { readJsonBody } from '../../lib/validate';
import { BloggerNotConfiguredError, importBlogger } from '../../lib/blogger-import';
import type { AuthenticatedHandler } from '../../lib/middleware';

const importPayload = z.object({ includeDrafts: z.boolean().default(false) });

/**
 * POST /api/admin/blogger/import
 * Imports posts from the linked Blogger blogs into D1. Body: { includeDrafts }.
 * Returns a per-publication summary. New content shows in the CMS immediately;
 * the public site reflects it on the next build and deploy.
 */
export const bloggerImport: AuthenticatedHandler = async ({ env, request }) => {
	const { includeDrafts } = importPayload.parse(await readJsonBody(request));
	try {
		const summary = await importBlogger(
			env.DB,
			{ clientId: env.BLOGGER_CLIENT_ID, clientSecret: env.BLOGGER_CLIENT_SECRET, refreshToken: env.BLOGGER_REFRESH_TOKEN },
			{ includeDrafts }
		);
		return ok(summary);
	} catch (error) {
		if (error instanceof BloggerNotConfiguredError) {
			return fail('blogger_not_configured', error.message, 400);
		}
		return fail('blogger_import_failed', error instanceof Error ? error.message : 'Blogger import failed.', 502);
	}
};

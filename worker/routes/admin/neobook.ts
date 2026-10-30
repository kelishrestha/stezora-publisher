import { ok } from '../../lib/http';
import { syncNeobook } from '../../lib/neobook';
import type { AuthenticatedHandler } from '../../lib/middleware';

/**
 * POST /api/admin/neobook/sync
 * Runs the Neobook sync into D1 (and R2 for media) and returns a summary. New
 * content shows in the CMS immediately; the public site reflects it on the next
 * build and deploy.
 */
export const neobookSync: AuthenticatedHandler = async ({ env }) => {
	const summary = await syncNeobook(env.DB, env.MEDIA);
	return ok(summary);
};

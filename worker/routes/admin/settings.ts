import { lt } from 'drizzle-orm';
import { z } from 'zod';
import { createDb } from '../../db/client';
import { pageViews } from '../../db/schema';
import { ok } from '../../lib/http';
import { readJsonBody } from '../../lib/validate';
import { readAppSettings, writeAppSettings } from '../../lib/settings';
import type { AuthenticatedHandler } from '../../lib/middleware';

/** GET /api/admin/settings */
export const getSettings: AuthenticatedHandler = async ({ env }) => {
	const settings = await readAppSettings(createDb(env.DB));
	return ok({ settings });
};

const settingsPatch = z.object({
	analyticsEnabled: z.boolean().optional(),
	consentMode: z.enum(['opt-out', 'opt-in']).optional(),
	retentionDays: z.number().int().min(1).max(3650).optional(),
});

/** PUT /api/admin/settings */
export const updateSettings: AuthenticatedHandler = async ({ env, request }) => {
	const patch = settingsPatch.parse(await readJsonBody(request));
	const db = createDb(env.DB);
	await writeAppSettings(db, patch);
	return ok({ settings: await readAppSettings(db) });
};

const clearPayload = z.object({ scope: z.enum(['all', 'old']) });

/**
 * POST /api/admin/analytics/clear
 * `all` wipes every pageview; `old` deletes rows past the retention window.
 */
export const clearAnalytics: AuthenticatedHandler = async ({ env, request }) => {
	const { scope } = clearPayload.parse(await readJsonBody(request));
	const db = createDb(env.DB);
	if (scope === 'all') {
		await db.delete(pageViews);
	} else {
		const settings = await readAppSettings(db);
		const cutoff = new Date(Date.now() - settings.retentionDays * 86_400_000).toISOString();
		await db.delete(pageViews).where(lt(pageViews.created_at, cutoff));
	}
	return ok({ cleared: true });
};

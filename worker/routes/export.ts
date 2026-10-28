import { createDb } from '../db/client';
import { bloggerSync, media, posts, postTags, publications, tags } from '../db/schema';
import { ApiError } from '../lib/errors';
import { ok } from '../lib/http';
import { authenticateSession } from '../lib/middleware';
import type { RouteHandler } from '../router';

/**
 * GET /api/export
 * Full-fidelity backup payload: every content table raw, drafts and all, with
 * nothing sanitized away. Auth accepts either an admin session (manual use)
 * or `Authorization: Bearer <BACKUP_TOKEN>` (the CI backup job). Auth tables
 * are deliberately excluded; the SQL dump layer covers those.
 */
export const exportAll: RouteHandler = async ({ request, env }) => {
	const bearer = request.headers.get('authorization');
	const token = env.BACKUP_TOKEN;
	const bearerOk = Boolean(token && bearer === `Bearer ${token}`);
	if (!bearerOk) {
		const user = await authenticateSession(request, env);
		if (!user) {
			throw new ApiError(401, 'UNAUTHORIZED', 'Authentication required.');
		}
	}

	const db = createDb(env.DB);
	const [publicationRows, postRows, tagRows, postTagRows, mediaRows, bloggerSyncRows] = await Promise.all([
		db.select().from(publications),
		db.select().from(posts),
		db.select().from(tags),
		db.select().from(postTags),
		db.select().from(media),
		db.select().from(bloggerSync),
	]);

	return ok({
		exportedAt: new Date().toISOString(),
		schema: 'stezora-export/1',
		counts: {
			publications: publicationRows.length,
			posts: postRows.length,
			tags: tagRows.length,
			postTags: postTagRows.length,
			media: mediaRows.length,
			bloggerSync: bloggerSyncRows.length,
		},
		publications: publicationRows,
		posts: postRows,
		tags: tagRows,
		postTags: postTagRows,
		media: mediaRows,
		bloggerSync: bloggerSyncRows,
	});
};

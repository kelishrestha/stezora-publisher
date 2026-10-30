import { createDb } from '../db/client';
import { bloggerSync, media, posts, postTags, publications, tags } from '../db/schema';
import { ApiError } from '../lib/errors';
import { ok } from '../lib/http';
import { authenticateSession } from '../lib/middleware';
import type { RouteHandler } from '../router';

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
	const bearerOk = Boolean(token && bearer && (await timingSafeEqual(bearer, `Bearer ${token}`)));
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

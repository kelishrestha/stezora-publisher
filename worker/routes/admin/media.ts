import { eq } from 'drizzle-orm';
import { createDb } from '../../db/client';
import { posts } from '../../db/schema';
import { MediaRepository, mediaUrl } from '../../db/media';
import { MediaService } from '../../services/media';
import { ApiError } from '../../lib/errors';
import { ok } from '../../lib/http';
import type { AuthenticatedHandler } from '../../lib/middleware';
import { validatePagination } from '../../lib/middleware';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * GET /api/admin/media
 * List media rows with pagination (metadata + public URL; the bytes live in R2).
 */
export const listAdminMedia: AuthenticatedHandler = async ({ env, request }) => {
	const url = new URL(request.url);
	const pagination = validatePagination(Object.fromEntries(url.searchParams.entries()));
	// Optional publication/post scoping so the editor's media panel only
	// offers media belonging to the post (or its publication, §55).
	const publicationId = url.searchParams.get('publicationId') ?? undefined;
	const postId = url.searchParams.get('postId') ?? undefined;
	const rows = await new MediaRepository(env.DB).list(pagination.limit, pagination.offset, publicationId, postId);
	const items = rows.map((row) => ({
		id: row.id,
		postId: row.post_id,
		publicationId: row.publication_id,
		filename: row.filename,
		mimeType: row.mime_type,
		size: row.size,
		url: mediaUrl(row),
		external: row.r2_key === null,
		createdAt: row.created_at,
	}));
	return ok({ media: items, limit: pagination.limit, offset: pagination.offset });
};

/**
 * POST /api/admin/media
 * Multipart upload. Media always belongs to a post and that post's
 * publication (one media row per post). Server-side validation lives in
 * MediaService (MIME allowlist, 10 MB limit, sanitized filename, generated
 * key — DEVELOPER.md §29). The raw bytes are never trusted and never placed
 * at a user-derived R2 path.
 */
export const uploadMedia: AuthenticatedHandler = async ({ env, request }) => {
	const declared = Number(request.headers.get('content-length') ?? 0);
	if (declared > MAX_UPLOAD_BYTES) {
		throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Upload exceeds the 10 MB limit.');
	}

	const formData = await request.formData();
	const file = formData.get('file');
	if (!(file instanceof File)) {
		throw new ApiError(400, 'VALIDATION_ERROR', 'A file field named "file" is required.');
	}
	const postId = typeof formData.get('postId') === 'string' ? (formData.get('postId') as string) : '';
	const publicationId =
		typeof formData.get('publicationId') === 'string' ? (formData.get('publicationId') as string) : '';
	if (!postId) {
		throw new ApiError(400, 'VALIDATION_ERROR', 'A postId field is required.');
	}
	if (!publicationId) {
		throw new ApiError(400, 'VALIDATION_ERROR', 'A publicationId field is required.');
	}

	const publicationIdOfPost = await resolvePostPublication(env.DB, postId);
	if (publicationIdOfPost !== publicationId) {
		throw new ApiError(
			400,
			'PUBLICATION_MISMATCH',
			'The selected publication does not own this post. Choose the post\'s publication.'
		);
	}

	const service = new MediaService(env.MEDIA, new MediaRepository(env.DB));
	const row = await service.put({
		filename: file.name,
		contentType: file.type,
		body: file,
		postId,
		publicationId,
	});

	return ok(
		{
			media: {
				id: row.id,
				postId: row.post_id,
				publicationId: row.publication_id,
				filename: row.filename,
				mimeType: row.mime_type,
				size: row.size,
				url: mediaUrl(row),
				external: row.r2_key === null,
				createdAt: row.created_at,
			},
		},
		201
	);
};

/**
 * Resolves the publication that owns a post, failing fast when the post
 * does not exist so media can never be attached to an unknown post.
 */
async function resolvePostPublication(binding: D1Database, postId: string): Promise<string> {
	const db = createDb(binding);
	const rows = await db
		.select({ publication_id: posts.publication_id })
		.from(posts)
		.where(eq(posts.id, postId))
		.limit(1);
	const found = rows[0];
	if (!found) {
		throw new ApiError(404, 'POST_NOT_FOUND', 'The selected post does not exist.');
	}
	return found.publication_id;
}
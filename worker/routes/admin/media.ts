import { MediaRepository } from '../../db/media';
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
	const rows = await new MediaRepository(env.DB).list(pagination.limit, pagination.offset);
	const items = rows.map((row) => ({
		id: row.id,
		postId: row.post_id,
		filename: row.filename,
		mimeType: row.mime_type,
		size: row.size,
		url: `/media/${row.r2_key}`,
		createdAt: row.created_at,
	}));
	return ok({ media: items, limit: pagination.limit, offset: pagination.offset });
};

/**
 * POST /api/admin/media
 * Multipart upload. Server-side validation lives in MediaService (MIME
 * allowlist, 10 MB limit, sanitized filename, generated key — DEVELOPER.md §29).
 * The raw bytes are never trusted and never placed at a user-derived R2 path.
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
	const postId = formData.get('postId');

	const service = new MediaService(env.MEDIA, new MediaRepository(env.DB));
	const row = await service.put({
		filename: file.name,
		contentType: file.type,
		body: file,
		postId: typeof postId === 'string' && postId ? postId : undefined,
	});

	return ok(
		{
			media: {
				id: row.id,
				postId: row.post_id,
				filename: row.filename,
				mimeType: row.mime_type,
				size: row.size,
				url: `/media/${row.r2_key}`,
				createdAt: row.created_at,
			},
		},
		201
	);
};
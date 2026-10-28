import { eq } from 'drizzle-orm';
import { createDb } from '../../db/client';
import { media, posts } from '../../db/schema';
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
 * DELETE /api/admin/media/:id
 * Removes a media row and its R2 object (external Blogger rows have none).
 * Blocked while a post uses the media as its featured image.
 */
export const deleteAdminMedia: AuthenticatedHandler = async ({ env, params }) => {
	const repository = new MediaRepository(env.DB);
	const row = await repository.getById(params.id);
	if (!row) {
		throw new ApiError(404, 'MEDIA_NOT_FOUND', 'Media was not found.');
	}

	const db = createDb(env.DB);
	const referencing = await db
		.select({ id: posts.id })
		.from(posts)
		.where(eq(posts.featured_image_id, row.id))
		.limit(1);
	if (referencing.length > 0) {
		throw new ApiError(409, 'IN_USE', 'This media is the featured image of a post and cannot be deleted.');
	}

	if (row.r2_key) {
		await env.MEDIA.delete(row.r2_key);
	}
	await repository.deleteById(row.id);
	return ok({ deleted: true });
};

const EXT_BY_MIME: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/gif': 'gif',
	'image/webp': 'webp',
	'image/avif': 'avif',
};

/**
 * POST /api/admin/media/:id/localize
 * Downloads an external (Blogger-hosted) media row into R2, fills in the real
 * mime type and size, and rewrites the owning post's content and markdown to
 * reference /media/<key> instead of the external URL. Idempotent: rows that
 * already have an R2 object return immediately.
 */
export const localizeMedia: AuthenticatedHandler = async ({ env, params }) => {
	const repository = new MediaRepository(env.DB);
	const row = await repository.getById(params.id);
	if (!row) {
		throw new ApiError(404, 'MEDIA_NOT_FOUND', 'Media was not found.');
	}
	if (row.r2_key) {
		return ok({ media: { id: row.id, url: mediaUrl(row) }, alreadyLocalized: true });
	}
	if (!row.source_url) {
		throw new ApiError(400, 'NO_SOURCE', 'This media has neither an R2 object nor a source URL.');
	}

	// Blogger's CDN serves bounded variants; w1600 keeps display fidelity
	// without archiving multi-megapixel originals (source_url stays recorded).
	const isBlogger = /\bgoogleusercontent\.com$/.test(new URL(row.source_url).hostname);
	const candidates = isBlogger ? [`${row.source_url}=w1600`, row.source_url] : [row.source_url];

	let response: Response | null = null;
	for (const candidate of candidates) {
		const attempt = await fetch(candidate, { headers: { accept: 'image/*' } });
		if (attempt.ok) {
			response = attempt;
			break;
		}
	}
	if (!response) {
		throw new ApiError(502, 'FETCH_FAILED', `Could not download ${row.source_url}.`);
	}

	const bytes = await response.arrayBuffer();
	const contentType = response.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
	const extension = EXT_BY_MIME[contentType] ?? 'img';
	const key = `localized/${row.id}.${extension}`;
	await env.MEDIA.put(key, bytes, { httpMetadata: { contentType } });

	const db = createDb(env.DB);
	await db
		.update(media)
		.set({ r2_key: key, mime_type: contentType, size: bytes.byteLength, filename: `${row.filename}.${extension}` })
		.where(eq(media.id, row.id));

	// Rewrite the owning post so its content serves the localized copy.
	const owner = (
		await db
			.select({ id: posts.id, content: posts.content, content_markdown: posts.content_markdown })
			.from(posts)
			.where(eq(posts.id, row.post_id))
			.limit(1)
	)[0];
	let rewritten = false;
	if (owner) {
		const localUrl = `/media/${key}`;
		const content = owner.content.split(row.source_url).join(localUrl);
		const markdown = owner.content_markdown ? owner.content_markdown.split(row.source_url).join(localUrl) : owner.content_markdown;
		if (content !== owner.content || markdown !== owner.content_markdown) {
			await db.update(posts).set({ content, content_markdown: markdown }).where(eq(posts.id, owner.id));
			rewritten = true;
		}
	}

	return ok({
		media: { id: row.id, url: `/media/${key}`, mimeType: contentType, size: bytes.byteLength },
		rewrittenPost: rewritten,
	});
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
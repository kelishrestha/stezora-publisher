import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { createDb } from '../../db/client';
import { isMediaStorageEnabled } from '../../db/media';
import { media, publications } from '../../db/schema';
import { PostRepository, isPostStatus, type PostStatus } from '../../db/posts';
import { ApiError } from '../../lib/errors';
import { ok } from '../../lib/http';
import { renderMarkdownToSanitizedHtml } from '../../lib/markdown';
import type { AuthenticatedHandler } from '../../lib/middleware';
import { validatePagination } from '../../lib/middleware';
import { readJsonBody } from '../../lib/validate';
import { slugify } from '../../../src/lib/publications';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const postPayload = z.object({
	publicationId: z.string().min(1),
	title: z.string().min(1).max(300),
	slug: z.string().max(200).optional(),
	excerpt: z.string().max(500).default(''),
	contentMarkdown: z.string().max(2_000_000).default(''),
	tagNames: z.array(z.string().max(50)).default([]),
	status: z.string().default('draft'),
	publishedAt: z.string().nullable().optional(),
	seoTitle: z.string().max(200).nullable().optional(),
	seoDescription: z.string().max(400).nullable().optional(),
	featuredImageId: z.string().nullable().optional(),
});

type PostPayload = z.infer<typeof postPayload>;

function parseStatus(value: string): PostStatus {
	if (!isPostStatus(value)) {
		throw new ApiError(400, 'VALIDATION_ERROR', `Invalid status '${value}'.`);
	}
	return value;
}

/**
 * GET /api/admin/posts
 * List posts with optional publication/status filters and pagination.
 */
export const listPosts: AuthenticatedHandler = async ({ env, request }) => {
	const url = new URL(request.url);
	const pagination = validatePagination(Object.fromEntries(url.searchParams.entries()));
	const publicationId = url.searchParams.get('publicationId') ?? undefined;
	const statusParam = url.searchParams.get('status') ?? undefined;
	const status = statusParam ? parseStatus(statusParam) : undefined;
	// sort=published orders by the actual publish date (dashboard recents);
	// the default stays most-recently-updated for the posts table.
	const sort = url.searchParams.get('sort') === 'published' ? ('published' as const) : undefined;

	const repository = new PostRepository(env.DB, isMediaStorageEnabled(env));
	const posts = await repository.list({ publicationId, status, sort, ...pagination });
	return ok({ posts, limit: pagination.limit, offset: pagination.offset });
};

/**
 * GET /api/admin/posts/meta
 * Editor bootstrap: publications (with accents) and tags so the post editor
 * can render its selectors from CMS data (P4.5 tables).
 */
export const editorMeta: AuthenticatedHandler = async ({ env }) => {
	const db = createDb(env.DB);
	const [publicationsResult, tagsResult] = await Promise.all([
		db
			.select({
				id: publications.id,
				name: publications.name,
				slug: publications.slug,
				accent: publications.accent,
			})
			.from(publications)
			.orderBy(publications.slug),
		new PostRepository(env.DB, isMediaStorageEnabled(env)).listTags(),
	]);
	return ok({ publications: publicationsResult, tags: tagsResult });
};

/**
 * POST /api/admin/posts
 * Create a post. Content markdown is rendered through the shared pipeline
 * (markdown → HTML → sanitized HTML) and stored in `content`; the raw markdown
 * is kept in `content_markdown` so the editor can round-trip. Slug is
 * auto-generated from the title when absent.
 */
export const createPost: AuthenticatedHandler = async ({ env, request }) => {
	const raw = await readJsonBody(request);
	const body = postPayload.parse(raw) as PostPayload;
	const status = parseStatus(body.status);

	const publication = await resolvePublication(env.DB, body.publicationId);
	const slug = normalizeSlug(body.slug, body.title, publication.slug);

	const repository = new PostRepository(env.DB, isMediaStorageEnabled(env));
	if (await repository.existsBySlug(publication.id, slug)) {
		throw new ApiError(409, 'SLUG_CONFLICT', `A post with the slug '${slug}' already exists in this publication.`);
	}

	const contentHtml = renderMarkdownToSanitizedHtml(body.contentMarkdown);
	const now = new Date().toISOString();
	const publishedAt =
		status === 'published' ? body.publishedAt ?? now : body.publishedAt ?? null;

	// Media is post-owned (§28): a post has no media rows before it exists, so
	// a featured image can only be attached by a later update.
	if (body.featuredImageId) {
		throw new ApiError(
			400,
			'VALIDATION_ERROR',
			'Save the post before setting a featured image.'
		);
	}

	const post = await repository.create({
		publicationId: publication.id,
		title: body.title,
		slug,
		excerpt: body.excerpt,
		content: contentHtml,
		contentMarkdown: body.contentMarkdown,
		seoTitle: body.seoTitle ?? null,
		seoDescription: body.seoDescription ?? null,
		status,
		publishedAt,
		tagNames: body.tagNames,
		featuredImageId: null,
		createdAt: now,
	});

	return ok({ post }, 201);
};

/**
 * GET /api/admin/posts/:id
 */
export const getPost: AuthenticatedHandler = async ({ env, params }) => {
	const repository = new PostRepository(env.DB, isMediaStorageEnabled(env));
	const post = await repository.getById(params.id);
	if (!post) {
		throw new ApiError(404, 'POST_NOT_FOUND', 'Post was not found.');
	}
	return ok({ post });
};

/**
 * PUT /api/admin/posts/:id
 * Update a post. Content is re-rendered and re-sanitized on every save
 * (DEVELOPER.md §83 rule 1).
 */
export const updatePost: AuthenticatedHandler = async ({ env, request, params }) => {
	const repository = new PostRepository(env.DB, isMediaStorageEnabled(env));
	const existing = await repository.getById(params.id);
	if (!existing) {
		throw new ApiError(404, 'POST_NOT_FOUND', 'Post was not found.');
	}

	const raw = await readJsonBody(request);
	const body = postPayload.parse(raw) as PostPayload;
	const status = parseStatus(body.status);

	const publication = await resolvePublication(env.DB, body.publicationId);
	const slug = normalizeSlug(body.slug, body.title, publication.slug);
	if (await repository.existsBySlug(publication.id, slug, existing.id)) {
		throw new ApiError(409, 'SLUG_CONFLICT', `A post with the slug '${slug}' already exists in this publication.`);
	}

	const now = new Date().toISOString();
	const publishedAt =
		status === 'published'
			? body.publishedAt ?? existing.publishedAt ?? now
			: body.publishedAt ?? existing.publishedAt;
	const featuredImageId = await resolveFeaturedImage(
		env.DB,
		body.featuredImageId,
		existing.id
	);

	const post = await repository.update(existing.id, {
		publicationId: publication.id,
		title: body.title,
		slug,
		excerpt: body.excerpt,
		content: renderMarkdownToSanitizedHtml(body.contentMarkdown),
		contentMarkdown: body.contentMarkdown,
		seoTitle: body.seoTitle ?? null,
		seoDescription: body.seoDescription ?? null,
		status,
		publishedAt,
		tagNames: body.tagNames,
		featuredImageId,
		updatedAt: now,
	});

	return ok({ post });
};

/**
 * POST /api/admin/posts/:id/publish
 * Idempotent publish: sets status to published and stamps `published_at` only
 * when it is absent, so re-publishing never rewrites history.
 */
export const publishPost: AuthenticatedHandler = async ({ env, params }) => {
	const repository = new PostRepository(env.DB, isMediaStorageEnabled(env));
	const post = await repository.setStatus(params.id, 'published', new Date().toISOString());
	return ok({ post });
};

/**
 * DELETE /api/admin/posts/:id
 */
export const deletePost: AuthenticatedHandler = async ({ env, params }) => {
	const repository = new PostRepository(env.DB, isMediaStorageEnabled(env));
	const mediaKeys = await repository.getMediaKeys(params.id);
	// Clean up R2 first. If this fails, the D1 rows remain and the operation can
	// be retried without losing the reference to the object.
	if (env.MEDIA) {
		await Promise.all(mediaKeys.map((key) => env.MEDIA!.delete(key)));
	}
	const deleted = await repository.delete(params.id);
	if (!deleted) {
		throw new ApiError(404, 'POST_NOT_FOUND', 'Post was not found.');
	}
	return ok({ deleted: true });
};

/**
 * POST /api/admin/posts/:id/preview
 * Renders the current content through the same pipeline the public site uses.
 * Accepts an optional `contentMarkdown` override so unsaved editor content can
 * be previewed. Auth is required (a draft preview is never public).
 */
export const previewPost: AuthenticatedHandler = async ({ env, request, params }) => {
	const repository = new PostRepository(env.DB, isMediaStorageEnabled(env));
	const existing = await repository.getById(params.id);
	if (!existing) {
		throw new ApiError(404, 'POST_NOT_FOUND', 'Post was not found.');
	}

	const raw = await readJsonBody(request);
	const parsed = z.object({ contentMarkdown: z.string().max(2_000_000).optional() }).parse(raw);
	const markdown = parsed.contentMarkdown ?? existing.contentMarkdown;
	const html = renderMarkdownToSanitizedHtml(markdown);

	return ok({ html, title: existing.title });
};

/**
 * Resolves the featured-image media id for an update. Media is post-owned
 * (§28): the referenced row must exist and belong to this post, so a post can
 * never feature another post's upload. `null` clears the featured image.
 */
async function resolveFeaturedImage(
	binding: D1Database,
	featuredImageId: string | null | undefined,
	postId: string
): Promise<string | null> {
	if (!featuredImageId) {
		return null;
	}
	const db = createDb(binding);
	const rows = await db
		.select({ id: media.id, post_id: media.post_id })
		.from(media)
		.where(eq(media.id, featuredImageId))
		.limit(1);
	const found = rows[0];
	if (!found) {
		throw new ApiError(400, 'UNKNOWN_MEDIA', `Media '${featuredImageId}' does not exist.`);
	}
	if (found.post_id !== postId) {
		throw new ApiError(
			400,
			'PUBLICATION_MISMATCH',
			'The featured image must be media attached to this post.'
		);
	}
	return found.id;
}

/**
 * Resolves a publication by id, failing fast when it does not exist so a post
 * can never be assigned to an unknown publication (publication isolation).
 */
async function resolvePublication(binding: D1Database, publicationId: string) {
	const db = createDb(binding);
	const rows = await db
		.select({ id: publications.id, slug: publications.slug })
		.from(publications)
		.where(eq(publications.id, publicationId))
		.limit(1);
	const found = rows[0];
	if (!found) {
		throw new ApiError(400, 'UNKNOWN_PUBLICATION', `Publication '${publicationId}' does not exist.`);
	}
	return found;
}

function normalizeSlug(raw: string | undefined, title: string, publicationSlug: string): string {
	const value = raw?.trim() ? raw : slugify(title);
	const slug = value.toLowerCase().trim();
	if (!SLUG_PATTERN.test(slug)) {
		throw new ApiError(400, 'VALIDATION_ERROR', 'Slug must be lowercase and contain only letters, numbers, and dashes.');
	}
	if (slug === publicationSlug) {
		throw new ApiError(400, 'VALIDATION_ERROR', 'A post slug cannot match the publication slug.');
	}
	return slug;
}

import { z } from 'zod';
import { TagRepository } from '../../db/tags';
import { ApiError } from '../../lib/errors';
import { ok } from '../../lib/http';
import type { AuthenticatedHandler } from '../../lib/middleware';
import { readJsonBody } from '../../lib/validate';
import { slugify } from '../../../src/lib/publications';

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const tagPayload = z.object({
	name: z.string().min(1).max(120),
	slug: z.string().max(160).optional(),
});

type TagPayload = z.infer<typeof tagPayload>;

function normalizeSlug(raw: string | undefined, name: string): string {
	const value = raw?.trim() ? raw : slugify(name);
	const slug = value.toLowerCase().trim();
	if (!SLUG_PATTERN.test(slug)) {
		throw new ApiError(400, 'VALIDATION_ERROR', 'Slug must be lowercase and contain only letters, numbers, and dashes.');
	}
	return slug;
}

/**
 * GET /api/admin/tags
 * List all tags (tags are shared across publications, §10).
 */
export const listTags: AuthenticatedHandler = async ({ env }) => {
	const tags = await new TagRepository(env.DB).list();
	return ok({ tags });
};

/**
 * POST /api/admin/tags
 * Create a tag. Tags.slug is globally unique.
 */
export const createTag: AuthenticatedHandler = async ({ env, request }) => {
	const raw = await readJsonBody(request);
	const body = tagPayload.parse(raw) as TagPayload;
	const slug = normalizeSlug(body.slug, body.name);

	const repository = new TagRepository(env.DB);
	if (await repository.existsBySlug(slug)) {
		throw new ApiError(409, 'SLUG_CONFLICT', `A tag with the slug '${slug}' already exists.`);
	}

	const tag = await repository.create({ name: body.name, slug });
	return ok({ tag }, 201);
};

/**
 * PUT /api/admin/tags/:id
 */
export const updateTag: AuthenticatedHandler = async ({ env, request, params }) => {
	const repository = new TagRepository(env.DB);
	const existing = await repository.getById(params.id);
	if (!existing) {
		throw new ApiError(404, 'TAG_NOT_FOUND', 'Tag was not found.');
	}

	const raw = await readJsonBody(request);
	const parsed = z
		.object({ name: z.string().min(1).max(120).optional(), slug: z.string().max(160).optional() })
		.parse(raw) as { name?: string; slug?: string };

	const name = parsed.name ?? existing.name;
	const slug = parsed.slug ? normalizeSlug(parsed.slug, name) : existing.slug;
	if (await repository.existsBySlug(slug, existing.id)) {
		throw new ApiError(409, 'SLUG_CONFLICT', `A tag with the slug '${slug}' already exists.`);
	}

	const tag = await repository.update(existing.id, { name, slug });
	return ok({ tag });
};

/**
 * DELETE /api/admin/tags/:id
 * Removal is blocked by the repository while posts still reference it (409 IN_USE).
 */
export const deleteTag: AuthenticatedHandler = async ({ env, params }) => {
	const repository = new TagRepository(env.DB);
	try {
		const deleted = await repository.delete(params.id);
		if (!deleted) {
			throw new ApiError(404, 'TAG_NOT_FOUND', 'Tag was not found.');
		}
	} catch (error) {
		if (error instanceof Error && error.message === 'TAG_IN_USE') {
			throw new ApiError(409, 'IN_USE', 'This tag is still referenced by one or more posts and cannot be deleted.');
		}
		throw error;
	}
	return ok({ deleted: true });
};
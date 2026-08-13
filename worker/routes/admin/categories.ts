import { z } from 'zod';
import { CategoryRepository } from '../../db/categories';
import { ApiError } from '../../lib/errors';
import { ok } from '../../lib/http';
import type { AuthenticatedHandler } from '../../lib/middleware';
import { readJsonBody } from '../../lib/validate';
import { slugify } from '../../../src/lib/publications';

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const categoryPayload = z.object({
	publicationId: z.string().min(1),
	name: z.string().min(1).max(120),
	slug: z.string().max(160).optional(),
});

type CategoryPayload = z.infer<typeof categoryPayload>;

function normalizeSlug(raw: string | undefined, name: string): string {
	const value = raw?.trim() ? raw : slugify(name);
	const slug = value.toLowerCase().trim();
	if (!SLUG_PATTERN.test(slug)) {
		throw new ApiError(400, 'VALIDATION_ERROR', 'Slug must be lowercase and contain only letters, numbers, and dashes.');
	}
	return slug;
}

/**
 * GET /api/admin/categories
 * List categories, optionally scoped to one publication.
 */
export const listCategories: AuthenticatedHandler = async ({ env, request }) => {
	const url = new URL(request.url);
	const publicationId = url.searchParams.get('publicationId') ?? undefined;
	const categories = await new CategoryRepository(env.DB).list(publicationId);
	return ok({ categories });
};

/**
 * POST /api/admin/categories
 * Create a category. Slug must be unique within its publication.
 */
export const createCategory: AuthenticatedHandler = async ({ env, request }) => {
	const raw = await readJsonBody(request);
	const body = categoryPayload.parse(raw) as CategoryPayload;
	const slug = normalizeSlug(body.slug, body.name);

	const repository = new CategoryRepository(env.DB);
	if (await repository.existsBySlug(body.publicationId, slug)) {
		throw new ApiError(409, 'SLUG_CONFLICT', `A category with the slug '${slug}' already exists in this publication.`);
	}

	const category = await repository.create({ publicationId: body.publicationId, name: body.name, slug });
	return ok({ category }, 201);
};

/**
 * PUT /api/admin/categories/:id
 * Update name and/or slug. Slug uniqueness still applies within the publication.
 */
export const updateCategory: AuthenticatedHandler = async ({ env, request, params }) => {
	const repository = new CategoryRepository(env.DB);
	const existing = await repository.getById(params.id);
	if (!existing) {
		throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'Category was not found.');
	}

	const raw = await readJsonBody(request);
	const parsed = z
		.object({ name: z.string().min(1).max(120).optional(), slug: z.string().max(160).optional() })
		.parse(raw) as { name?: string; slug?: string };

	const name = parsed.name ?? existing.name;
	const slug = parsed.slug ? normalizeSlug(parsed.slug, name) : existing.slug;
	if (await repository.existsBySlug(existing.publication_id, slug, existing.id)) {
		throw new ApiError(409, 'SLUG_CONFLICT', `A category with the slug '${slug}' already exists in this publication.`);
	}

	const category = await repository.update(existing.id, { name, slug });
	return ok({ category });
};

/**
 * DELETE /api/admin/categories/:id
 * Removal is blocked by the repository while posts still reference it (409 IN_USE).
 */
export const deleteCategory: AuthenticatedHandler = async ({ env, params }) => {
	const repository = new CategoryRepository(env.DB);
	try {
		const deleted = await repository.delete(params.id);
		if (!deleted) {
			throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'Category was not found.');
		}
	} catch (error) {
		if (error instanceof Error && error.message === 'CATEGORY_IN_USE') {
			throw new ApiError(409, 'IN_USE', 'This category is still referenced by one or more posts and cannot be deleted.');
		}
		throw error;
	}
	return ok({ deleted: true });
};
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { createDb } from '../../db/client';
import { testimonials } from '../../db/schema';
import { fail, ok } from '../../lib/http';
import { readJsonBody } from '../../lib/validate';
import type { AuthenticatedHandler } from '../../lib/middleware';

const payload = z.object({
	name: z.string().trim().min(1).max(120),
	location: z.string().trim().max(120).optional().default(''),
	work: z.string().trim().max(160).optional().default(''),
	story: z.string().trim().min(1).max(4000),
	visible: z.boolean().optional().default(true),
	sortOrder: z.number().int().min(0).max(100000).optional().default(0),
});

function toRow(id: string, data: z.infer<typeof payload>, createdAt: string) {
	return {
		id,
		name: data.name,
		location: data.location || null,
		work: data.work || null,
		story: data.story,
		visible: data.visible ? 1 : 0,
		sort_order: data.sortOrder,
		created_at: createdAt,
	};
}

/** GET /api/admin/testimonials */
export const listTestimonials: AuthenticatedHandler = async ({ env }) => {
	const rows = await createDb(env.DB).select().from(testimonials).orderBy(asc(testimonials.sort_order), asc(testimonials.created_at));
	return ok({ testimonials: rows });
};

/** POST /api/admin/testimonials */
export const createTestimonial: AuthenticatedHandler = async ({ env, request }) => {
	const data = payload.parse(await readJsonBody(request));
	const id = `ts-${crypto.randomUUID()}`;
	const row = toRow(id, data, new Date().toISOString());
	await createDb(env.DB).insert(testimonials).values(row);
	return ok({ testimonial: row }, 201);
};

/** PUT /api/admin/testimonials/:id */
export const updateTestimonial: AuthenticatedHandler = async ({ env, request, params }) => {
	const data = payload.parse(await readJsonBody(request));
	const db = createDb(env.DB);
	const existing = await db.select().from(testimonials).where(eq(testimonials.id, params.id)).limit(1);
	if (existing.length === 0) {
		return fail('not_found', 'Testimonial not found.', 404);
	}
	const row = toRow(params.id, data, existing[0].created_at);
	await db.update(testimonials).set(row).where(eq(testimonials.id, params.id));
	return ok({ testimonial: row });
};

/** DELETE /api/admin/testimonials/:id */
export const deleteTestimonial: AuthenticatedHandler = async ({ env, params }) => {
	await createDb(env.DB).delete(testimonials).where(eq(testimonials.id, params.id));
	return ok({ deleted: true });
};

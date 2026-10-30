import { desc, sql } from 'drizzle-orm';
import { createDb } from '../../db/client';
import { books } from '../../db/schema';
import { ok } from '../../lib/http';
import type { AuthenticatedHandler } from '../../lib/middleware';

/**
 * GET /api/admin/books
 * Lists the standalone works imported from Neobook, newest first.
 */
export const listBooks: AuthenticatedHandler = async ({ env }) => {
	const rows = await createDb(env.DB)
		.select()
		.from(books)
		.orderBy(desc(sql`coalesce(${books.published_at}, ${books.created_at})`));
	return ok({ books: rows });
};

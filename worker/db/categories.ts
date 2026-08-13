import { and, asc, eq, ne } from 'drizzle-orm';
import { createDb, type Db } from './client';
import { categories, posts } from './schema';

export interface CategoryRow {
	id: string;
	publication_id: string;
	name: string;
	slug: string;
}

export interface NewCategory {
	publicationId: string;
	name: string;
	slug: string;
}

/**
 * CategoryRepository: categories are scoped to a publication
 * (`unique(publication_id, slug)`, DEVELOPER.md §10). Deletion is blocked
 * while any post still references the category (409 IN_USE) — never silent
 * reassignment.
 */
export class CategoryRepository {
	private readonly db: Db;

	constructor(binding: D1Database) {
		this.db = createDb(binding);
	}

	async list(publicationId?: string): Promise<CategoryRow[]> {
		return this.db
			.select({ id: categories.id, publication_id: categories.publication_id, name: categories.name, slug: categories.slug })
			.from(categories)
			.where(publicationId ? eq(categories.publication_id, publicationId) : undefined)
			.orderBy(asc(categories.name));
	}

	async getById(id: string): Promise<CategoryRow | null> {
		const rows = await this.db
			.select({ id: categories.id, publication_id: categories.publication_id, name: categories.name, slug: categories.slug })
			.from(categories)
			.where(eq(categories.id, id))
			.limit(1);
		return rows[0] ?? null;
	}

	async existsBySlug(publicationId: string, slug: string, excludeId?: string): Promise<boolean> {
		const conditions = [eq(categories.publication_id, publicationId), eq(categories.slug, slug)];
		if (excludeId) {
			conditions.push(ne(categories.id, excludeId));
		}
		const rows = await this.db
			.select({ id: categories.id })
			.from(categories)
			.where(and(...conditions))
			.limit(1);
		return rows.length > 0;
	}

	async create(input: NewCategory): Promise<CategoryRow> {
		const row: CategoryRow = {
			id: crypto.randomUUID(),
			publication_id: input.publicationId,
			name: input.name,
			slug: input.slug,
		};
		await this.db.insert(categories).values(row);
		return row;
	}

	async update(id: string, changes: Partial<NewCategory>): Promise<CategoryRow | null> {
		const existing = await this.getById(id);
		if (!existing) {
			return null;
		}
		const values: Partial<CategoryRow> = {};
		if (changes.name !== undefined) values.name = changes.name;
		if (changes.slug !== undefined) values.slug = changes.slug;
		await this.db.update(categories).set(values).where(eq(categories.id, id));
		return this.getById(id);
	}

	/**
	 * Returns false when the category does not exist, and throws 409 IN_USE
	 * when posts still reference it so callers never delete referenced data.
	 */
	async delete(id: string): Promise<boolean> {
		const existing = await this.getById(id);
		if (!existing) {
			return false;
		}
		const references = await this.db
			.select({ id: posts.id })
			.from(posts)
			.where(eq(posts.category_id, id))
			.limit(1);
		if (references.length > 0) {
			throw new Error('CATEGORY_IN_USE');
		}
		await this.db.delete(categories).where(eq(categories.id, id));
		return true;
	}
}

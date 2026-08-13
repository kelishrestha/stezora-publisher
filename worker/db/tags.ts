import { and, asc, eq, ne } from 'drizzle-orm';
import { createDb, type Db } from './client';
import { postTags, tags } from './schema';

export interface TagRow {
	id: string;
	name: string;
	slug: string;
}

export interface NewTag {
	name: string;
	slug: string;
}

/**
 * TagRepository: tags are shared across publications (`tags.slug` globally
 * unique, DEVELOPER.md §10). Deletion is blocked while any post still uses the
 * tag (409 IN_USE) — never silent reassignment.
 */
export class TagRepository {
	private readonly db: Db;

	constructor(binding: D1Database) {
		this.db = createDb(binding);
	}

	async list(): Promise<TagRow[]> {
		return this.db
			.select({ id: tags.id, name: tags.name, slug: tags.slug })
			.from(tags)
			.orderBy(asc(tags.name));
	}

	async getById(id: string): Promise<TagRow | null> {
		const rows = await this.db
			.select({ id: tags.id, name: tags.name, slug: tags.slug })
			.from(tags)
			.where(eq(tags.id, id))
			.limit(1);
		return rows[0] ?? null;
	}

	async existsBySlug(slug: string, excludeId?: string): Promise<boolean> {
		const conditions = [eq(tags.slug, slug)];
		if (excludeId) {
			conditions.push(ne(tags.id, excludeId));
		}
		const rows = await this.db
			.select({ id: tags.id })
			.from(tags)
			.where(and(...conditions))
			.limit(1);
		return rows.length > 0;
	}

	async create(input: NewTag): Promise<TagRow> {
		const row: TagRow = {
			id: crypto.randomUUID(),
			name: input.name,
			slug: input.slug,
		};
		await this.db.insert(tags).values(row);
		return row;
	}

	async update(id: string, changes: Partial<NewTag>): Promise<TagRow | null> {
		const existing = await this.getById(id);
		if (!existing) {
			return null;
		}
		const values: Partial<TagRow> = {};
		if (changes.name !== undefined) values.name = changes.name;
		if (changes.slug !== undefined) values.slug = changes.slug;
		await this.db.update(tags).set(values).where(eq(tags.id, id));
		return this.getById(id);
	}

	/**
	 * Returns false when the tag does not exist, and throws 409 IN_USE when
	 * posts still reference it so callers never delete referenced data.
	 */
	async delete(id: string): Promise<boolean> {
		const existing = await this.getById(id);
		if (!existing) {
			return false;
		}
		const references = await this.db
			.select({ post_id: postTags.post_id })
			.from(postTags)
			.where(eq(postTags.tag_id, id))
			.limit(1);
		if (references.length > 0) {
			throw new Error('TAG_IN_USE');
		}
		await this.db.delete(tags).where(eq(tags.id, id));
		return true;
	}
}

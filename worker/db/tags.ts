import { and, asc, eq, ne } from 'drizzle-orm';
import { createDb, type Db } from './client';
import { postTags, tags } from './schema';

export interface TagRow {
	id: string;
	publication_id: string;
	name: string;
	slug: string;
}

export interface NewTag {
	publicationId: string;
	name: string;
	slug: string;
}

/**
 * TagRepository: tags belong to a publication (`unique(publication_id, slug)`,
 * DEVELOPER.md §10). The same tag name may exist in different publications as
 * separate rows. Deletion is blocked while any post in that publication still
 * uses the tag (409 IN_USE) — never silent reassignment.
 */
export class TagRepository {
	private readonly db: Db;

	constructor(binding: D1Database) {
		this.db = createDb(binding);
	}

	async list(publicationId?: string): Promise<TagRow[]> {
		return this.db
			.select({ id: tags.id, publication_id: tags.publication_id, name: tags.name, slug: tags.slug })
			.from(tags)
			.where(publicationId ? eq(tags.publication_id, publicationId) : undefined)
			.orderBy(asc(tags.name));
	}

	async getById(id: string): Promise<TagRow | null> {
		const rows = await this.db
			.select({ id: tags.id, publication_id: tags.publication_id, name: tags.name, slug: tags.slug })
			.from(tags)
			.where(eq(tags.id, id))
			.limit(1);
		return rows[0] ?? null;
	}

	async existsBySlug(publicationId: string, slug: string, excludeId?: string): Promise<boolean> {
		const conditions = [eq(tags.publication_id, publicationId), eq(tags.slug, slug)];
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
			publication_id: input.publicationId,
			name: input.name,
			slug: input.slug,
		};
		await this.db.insert(tags).values(row);
		return row;
	}

	async update(id: string, changes: Partial<Omit<NewTag, 'publicationId'>>): Promise<TagRow | null> {
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

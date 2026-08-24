import { desc, eq } from 'drizzle-orm';
import { createDb } from './client';
import { media } from './schema';

export interface MediaRow {
	id: string;
	post_id: string;
	publication_id: string;
	r2_key: string;
	filename: string;
	mime_type: string;
	size: number;
	created_at: string;
}

export interface NewMediaRow {
	id: string;
	post_id: string;
	publication_id: string;
	r2_key: string;
	filename: string;
	mime_type: string;
	size: number;
	created_at: string;
}

export class MediaRepository {
	private readonly db: ReturnType<typeof createDb>;

	constructor(binding: D1Database) {
		this.db = createDb(binding);
	}

	async insert(row: NewMediaRow): Promise<void> {
		await this.db.insert(media).values(row);
	}

	async getByKey(r2Key: string): Promise<MediaRow | null> {
		const rows = await this.db.select().from(media).where(eq(media.r2_key, r2Key)).limit(1);
		return rows[0] ?? null;
	}

	async getById(id: string): Promise<MediaRow | null> {
		const rows = await this.db.select().from(media).where(eq(media.id, id)).limit(1);
		return rows[0] ?? null;
	}

	async list(limit = 50, offset = 0, publicationId?: string): Promise<MediaRow[]> {
		const conditions = publicationId ? [eq(media.publication_id, publicationId)] : [];
		return this.db
			.select()
			.from(media)
			.where(conditions.length ? conditions[0] : undefined)
			.orderBy(desc(media.created_at))
			.limit(limit)
			.offset(offset);
	}

	async deleteById(id: string): Promise<void> {
		await this.db.delete(media).where(eq(media.id, id));
	}
}

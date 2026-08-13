import { desc, eq } from 'drizzle-orm';
import { createDb } from './client';
import { media } from './schema';

export interface MediaRow {
	id: string;
	post_id: string | null;
	r2_key: string;
	filename: string;
	mime_type: string;
	size: number;
	created_at: string;
}

export interface NewMediaRow {
	id: string;
	post_id?: string | null;
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

	async list(limit = 50, offset = 0): Promise<MediaRow[]> {
		return this.db
			.select()
			.from(media)
			.orderBy(desc(media.created_at))
			.limit(limit)
			.offset(offset);
	}

	async deleteById(id: string): Promise<void> {
		await this.db.delete(media).where(eq(media.id, id));
	}
}
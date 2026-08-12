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
	constructor(private readonly db: D1Database) {}

	async insert(row: NewMediaRow): Promise<void> {
		await this.db
			.prepare(
				'INSERT INTO media (id, post_id, r2_key, filename, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
			)
			.bind(
				row.id,
				row.post_id ?? null,
				row.r2_key,
				row.filename,
				row.mime_type,
				row.size,
				row.created_at
			)
			.run();
	}

	async getByKey(r2Key: string): Promise<MediaRow | null> {
		const result = await this.db
			.prepare('SELECT * FROM media WHERE r2_key = ?')
			.bind(r2Key)
			.first<MediaRow>();
		return result ?? null;
	}

	async getById(id: string): Promise<MediaRow | null> {
		const result = await this.db
			.prepare('SELECT * FROM media WHERE id = ?')
			.bind(id)
			.first<MediaRow>();
		return result ?? null;
	}

	async list(limit = 50, offset = 0): Promise<MediaRow[]> {
		const result = await this.db
			.prepare('SELECT * FROM media ORDER BY created_at DESC LIMIT ? OFFSET ?')
			.bind(limit, offset)
			.all<MediaRow>();
		return result.results ?? [];
	}

	async deleteById(id: string): Promise<void> {
		await this.db.prepare('DELETE FROM media WHERE id = ?').bind(id).run();
	}
}

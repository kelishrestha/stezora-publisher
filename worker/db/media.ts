import { and, desc, eq } from 'drizzle-orm';
import { createDb } from './client';
import { media } from './schema';

export interface MediaRow {
	id: string;
	post_id: string;
	publication_id: string;
	// R2 uploads carry r2_key; Blogger-imported media is external (r2_key
	// NULL) and identified by source_url until localized into R2.
	r2_key: string | null;
	source_url: string | null;
	filename: string;
	mime_type: string;
	size: number;
	created_at: string;
}

export type NewMediaRow = MediaRow;

/**
 * Public URL for a media row. With media storage enabled, R2-backed rows are
 * served from /media/<key>; with storage disabled (ENABLE_MEDIA_STORAGE=false
 * or no bucket bound), rows fall back to their external source URL (the
 * Blogger CDN) so the site keeps working without R2.
 */
export function mediaUrl(row: Pick<MediaRow, 'r2_key' | 'source_url'>, storageEnabled = true): string {
	if (storageEnabled && row.r2_key) {
		return `/media/${row.r2_key}`;
	}
	return row.source_url ?? (row.r2_key ? `/media/${row.r2_key}` : '');
}

/** Media storage is on only when the bucket is bound and not switched off. */
export function isMediaStorageEnabled(env: Env): boolean {
	return Boolean(env.MEDIA) && env.ENABLE_MEDIA_STORAGE !== 'false';
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

	async list(limit = 50, offset = 0, publicationId?: string, postId?: string): Promise<MediaRow[]> {
		const conditions = [
			...(publicationId ? [eq(media.publication_id, publicationId)] : []),
			...(postId ? [eq(media.post_id, postId)] : []),
		];
		return this.db
			.select()
			.from(media)
			.where(conditions.length ? and(...conditions) : undefined)
			.orderBy(desc(media.created_at))
			.limit(limit)
			.offset(offset);
	}

	async deleteById(id: string): Promise<void> {
		await this.db.delete(media).where(eq(media.id, id));
	}
}

import { MediaRepository, type MediaRow } from '../db/media';
import { ApiError } from '../lib/errors';

const SAFE_FILENAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

const ALLOWED_MIME_TYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/webp',
	'image/avif',
	'application/pdf',
]);

const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

function bodySize(body: PutMediaInput['body']): number {
	if (typeof body === 'string') {
		return new TextEncoder().encode(body).byteLength;
	}
	if (body instanceof Blob) {
		return body.size;
	}
	if (ArrayBuffer.isView(body)) {
		return body.byteLength;
	}
	if (body instanceof ArrayBuffer) {
		return body.byteLength;
	}
	return 0;
}

/**
 * Strips directory components and control characters from an uploaded
 * filename. Returns `null` when nothing usable remains, so callers can reject
 * the upload instead of storing an empty or unsafe name.
 */
export function sanitizeFilename(raw: string): string | null {
	const base = raw.split(/[\\/]/).pop() ?? '';
	const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').replace(/^\.+/, '');
	if (!cleaned || cleaned.length > 255 || !SAFE_FILENAME.test(cleaned)) {
		return null;
	}
	return cleaned;
}

/**
 * Builds a storage key from a random UUID and the sanitized filename so the
 * key can never be derived from (or include) user-controlled path input.
 * R2 keys may contain slashes; the public route treats everything after
 * `/media/` as the key.
 */
export function mediaKey(filename: string): string {
	return `${crypto.randomUUID()}-${filename}`;
}

/** Uploads always live in R2, so their r2_key is never null. */
export type UploadedMediaRow = MediaRow & { r2_key: string };

export interface PutMediaInput {
	filename: string;
	body: ArrayBuffer | ArrayBufferView | string | Blob;
	contentType: string;
	postId: string;
	publicationId: string;
}

export class MediaService {
	constructor(
		private readonly bucket: R2Bucket,
		private readonly repository: MediaRepository
	) {}

	async put(input: PutMediaInput): Promise<UploadedMediaRow> {
		const safeFilename = sanitizeFilename(input.filename);
		if (!safeFilename) {
			throw new ApiError(400, 'INVALID_FILENAME', 'The uploaded filename is invalid.');
		}
		if (!ALLOWED_MIME_TYPES.has(input.contentType)) {
			throw new ApiError(
				415,
				'UNSUPPORTED_MEDIA_TYPE',
				`Media type '${input.contentType}' is not allowed.`
			);
		}
		const size = bodySize(input.body);
		if (size > MAX_MEDIA_BYTES) {
			throw new ApiError(
				413,
				'PAYLOAD_TOO_LARGE',
				`Media exceeds the ${MAX_MEDIA_BYTES / (1024 * 1024)} MB limit.`
			);
		}

		const key = mediaKey(safeFilename);
		await this.bucket.put(key, input.body, {
			httpMetadata: { contentType: input.contentType },
		});

		const row: UploadedMediaRow = {
			id: crypto.randomUUID(),
			post_id: input.postId,
			publication_id: input.publicationId,
			r2_key: key,
			source_url: null,
			filename: safeFilename,
			mime_type: input.contentType,
			size,
			created_at: new Date().toISOString(),
		};
		try {
			await this.repository.insert(row);
		} catch (error) {
			await this.bucket.delete(key);
			throw error;
		}
		return row;
	}

	async get(key: string): Promise<{ row: MediaRow; object: R2ObjectBody } | null> {
		const row = await this.repository.getByKey(key);
		if (!row) {
			return null;
		}
		const object = await this.bucket.get(key);
		if (!object) {
			return null;
		}
		return { row, object };
	}

	async delete(key: string): Promise<boolean> {
		const row = await this.repository.getByKey(key);
		if (!row) {
			return false;
		}
		await this.bucket.delete(key);
		await this.repository.deleteById(row.id);
		return true;
	}

	async list(limit = 50, offset = 0): Promise<MediaRow[]> {
		return this.repository.list(limit, offset);
	}
}

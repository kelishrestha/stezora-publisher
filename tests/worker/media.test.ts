import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker from '../../worker/index';
import { MediaRepository } from '../../worker/db/media';
import { MediaService, mediaKey, sanitizeFilename } from '../../worker/services/media';

const db = env.DB;

function makeService(): MediaService {
	return new MediaService(env.MEDIA, new MediaRepository(db));
}

describe('sanitizeFilename', () => {
	it('strips directory components', () => {
		expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
		expect(sanitizeFilename('C:\\Users\\me\\photo.jpg')).toBe('photo.jpg');
		expect(sanitizeFilename('/absolute/path/file.txt')).toBe('file.txt');
	});

	it('rejects unsafe or empty names', () => {
		expect(sanitizeFilename('')).toBeNull();
		expect(sanitizeFilename('...')).toBeNull();
		expect(sanitizeFilename('no spaces here.png')).toBeNull();
		expect(sanitizeFilename('a'.repeat(300) + '.png')).toBeNull();
	});

	it('strips leading dots and control characters', () => {
		expect(sanitizeFilename('.hidden.png')).toBe('hidden.png');
		expect(sanitizeFilename('file\u0000name.png')).toBe('filename.png');
	});
});

describe('mediaKey', () => {
	it('returns a UUID-prefixed, filename-suffixed key', () => {
		const key = mediaKey('hero.png');
		expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-hero\.png$/);
	});

	it('produces a different key for each call', () => {
		expect(mediaKey('a.png')).not.toBe(mediaKey('a.png'));
	});
});

describe('MediaService against emulated R2 and D1', () => {
	it('puts an object into R2 and a row into D1', async () => {
		const service = makeService();
		const row = await service.put({
			filename: 'header.png',
			contentType: 'image/png',
			body: new TextEncoder().encode('png-bytes'),
		});

		expect(row.filename).toBe('header.png');
		expect(row.mime_type).toBe('image/png');
		expect(row.size).toBe('png-bytes'.length);
		expect(row.r2_key).toMatch(/-header\.png$/);

		const object = await env.MEDIA.get(row.r2_key);
		expect(object).not.toBeNull();
		expect(await object?.text()).toBe('png-bytes');
		expect(object?.httpMetadata?.contentType).toBe('image/png');
	});

	it('gets a stored object back with its row', async () => {
		await db
			.prepare('INSERT INTO publications (id, name, slug, description, created_at) VALUES (?, ?, ?, NULL, ?)')
			.bind('pub-1', 'Pub One', 'pub-one', new Date().toISOString())
			.run();
		await db
			.prepare(
				`INSERT INTO posts (id, publication_id, category_id, title, slug, excerpt, content, status, published_at, updated_at, created_at)
				 VALUES ('post-1', 'pub-1', NULL, 'T', 's', 'e', '<p>b</p>', 'published', ?, ?, ?)`
			)
			.bind(new Date().toISOString(), new Date().toISOString(), new Date().toISOString())
			.run();

		const service = makeService();
		const { r2_key: key } = await service.put({
			filename: 'doc.pdf',
			contentType: 'application/pdf',
			body: new TextEncoder().encode('%PDF-1.4'),
			postId: 'post-1',
		});

		const found = await service.get(key);
		expect(found).not.toBeNull();
		expect(found?.row.post_id).toBe('post-1');
		expect(await found?.object.text()).toBe('%PDF-1.4');
	});

	it('sanitizes the filename before storing', async () => {
		const service = makeService();
		const row = await service.put({
			filename: '../../safe/hero.png',
			contentType: 'image/png',
			body: new TextEncoder().encode('png-bytes'),
		});
		expect(row.filename).toBe('hero.png');
		expect(row.r2_key).toMatch(/-hero\.png$/);
	});

	it('rejects an unsafe filename with 400 INVALID_FILENAME', async () => {
		const service = makeService();
		await expect(
			service.put({
				filename: 'no spaces here.png',
				contentType: 'image/png',
				body: new TextEncoder().encode('x'),
			})
		).rejects.toMatchObject({ status: 400, code: 'INVALID_FILENAME' });
	});

	it('rejects a disallowed MIME type with 415 UNSUPPORTED_MEDIA_TYPE', async () => {
		const service = makeService();
		await expect(
			service.put({
				filename: 'page.html',
				contentType: 'text/html',
				body: new TextEncoder().encode('<p>hi</p>'),
			})
		).rejects.toMatchObject({ status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
	});

	it('removes the R2 object when the D1 insert fails', async () => {
		const failingRepository = {
			insert: async () => {
				throw new Error('D1 write failed');
			},
		} as unknown as MediaRepository;
		const service = new MediaService(env.MEDIA, failingRepository);

		const before = await env.MEDIA.list();
		await expect(
			service.put({
				filename: 'orphan.png',
				contentType: 'image/png',
				body: new TextEncoder().encode('x'),
			})
		).rejects.toThrow('D1 write failed');

		const after = await env.MEDIA.list();
		expect(after.objects.length).toBe(before.objects.length);
	});

	it('returns null when no row exists for an object in the bucket', async () => {
		const service = makeService();
		const key = 'orphan-object.png';
		await env.MEDIA.put(key, 'data');
		// Row intentionally not inserted; service.get returns null for unknown keys.
		expect(await service.get(key)).toBeNull();
	});

	it('deletes both the object and the row', async () => {
		const service = makeService();
		const { r2_key: key } = await service.put({
			filename: 'todelete.png',
			contentType: 'image/png',
			body: new TextEncoder().encode('x'),
		});

		expect(await service.delete(key)).toBe(true);
		expect(await env.MEDIA.get(key)).toBeNull();
		expect(await service.get(key)).toBeNull();

		expect(await service.delete(key)).toBe(false);
	});
});

describe('GET /media/:key route', () => {
	async function fetchMedia(key: string): Promise<Response> {
		const request = new Request(`https://example.com/media/${encodeURIComponent(key)}`);
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		return response;
	}

	it('serves the object with immutable cache headers', async () => {
		const service = makeService();
		const { r2_key: key } = await service.put({
			filename: 'hero.webp',
			contentType: 'image/webp',
			body: new TextEncoder().encode('webp-data'),
		});

		const response = await fetchMedia(key);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('image/webp');
		expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
		expect(response.headers.get('etag')).toBeTruthy();
		expect(response.headers.get('x-request-id')).toBeTruthy();
		expect(await response.text()).toBe('webp-data');
	});

	it('returns 404 for an unknown key', async () => {
		const response = await fetchMedia('00000000-0000-0000-0000-000000000000-missing.png');
		expect(response.status).toBe(404);
	});

	it('returns 404 when the object is missing but a row exists', async () => {
		const service = makeService();
		const { r2_key: key } = await service.put({
			filename: 'phantom.png',
			contentType: 'image/png',
			body: new TextEncoder().encode('y'),
		});
		await env.MEDIA.delete(key);

		const response = await fetchMedia(key);
		expect(response.status).toBe(404);
	});
});

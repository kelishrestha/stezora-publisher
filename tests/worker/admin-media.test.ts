import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import worker from '../../worker/index';

const db = env.DB;

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'correct-horse-battery-staple';
const ADMIN_HASH =
	'ce018f62e94bb4691067bb9dcd0619af:25c1257d17e89a1312174042b05759811aca8c66a1fcbbb05c87d41b4df1936f8be05b155c4fb30387a417cef6820e3217fd8650d1bbbb592f613cb0e4b0adde';

async function fetchWorker(path: string, init?: RequestInit): Promise<Response> {
	const ctx = createExecutionContext();
	const response = await worker.fetch(new Request(`http://localhost${path}`, init), env, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

async function seedAdminUser(): Promise<void> {
	const now = new Date().toISOString();
	await db
		.prepare(
			'INSERT OR IGNORE INTO user (id, name, email, email_verified, image, created_at, updated_at, role) VALUES (?, ?, ?, 0, NULL, ?, ?, ?)'
		)
		.bind('usr-admin', 'Site Admin', ADMIN_EMAIL, now, now, 'admin')
		.run();
	await db
		.prepare(
			'INSERT OR IGNORE INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
		)
		.bind('acc-admin', 'usr-admin', 'credential', 'usr-admin', ADMIN_HASH, now, now)
		.run();
}

async function signInAndCookies(): Promise<string> {
	const response = await fetchWorker('/api/auth/sign-in/email', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
	});
	const setCookie = response.headers.get('set-cookie');
	if (!setCookie) {
		throw new Error(`sign-in (${response.status}) did not set a session cookie: ${await response.text()}`);
	}
	return setCookie.split(';')[0];
}

interface Envelope {
	success?: boolean;
	data?: Record<string, unknown>;
	error?: { code?: string; message?: string };
}

function uploadBody(file: Blob, filename: string): FormData {
	const form = new FormData();
	form.append('file', file, filename);
	return form;
}

describe('admin media API', () => {
	let cookie: string;

	beforeAll(async () => {
		await seedAdminUser();
		cookie = await signInAndCookies();
	});

	it('requires authentication for list and upload', async () => {
		expect((await fetchWorker('/api/admin/media')).status).toBe(401);
		expect((await fetchWorker('/api/admin/media', { method: 'POST', body: new FormData() })).status).toBe(401);
	});

	it('lists media (empty) and rejects a missing file field', async () => {
		const list = await fetchWorker('/api/admin/media', { headers: { cookie } });
		expect(list.status).toBe(200);
		expect(((await list.json()) as Envelope).data?.media).toEqual([]);

		const emptyForm = new FormData();
		const missing = await fetchWorker('/api/admin/media', { method: 'POST', headers: { cookie }, body: emptyForm });
		expect(missing.status).toBe(400);
		expect(((await missing.json()) as Envelope).error?.code).toBe('VALIDATION_ERROR');
	});

	it('uploads a PNG and returns public URL metadata', async () => {
		const form = uploadBody(new Blob(['png-bytes'], { type: 'image/png' }), 'header.png');
		const response = await fetchWorker('/api/admin/media', { method: 'POST', headers: { cookie }, body: form });
		expect(response.status).toBe(201);
		const body = (await response.json()) as Envelope;
		const media = body.data?.media as { id: string; filename: string; mimeType: string; size: number; url: string } | undefined;
		expect(media?.filename).toBe('header.png');
		expect(media?.mimeType).toBe('image/png');
		expect(media?.size).toBe('png-bytes'.length);
		expect(media?.url).toMatch(/^\/media\/[0-9a-f-]{36}-header\.png$/);

		// The public URL serves the object.
		const fetched = await fetchWorker(media?.url ?? '/media/none');
		expect(fetched.status).toBe(200);
		expect(await fetched.text()).toBe('png-bytes');

		// It now appears in the admin list.
		const list = await fetchWorker('/api/admin/media', { headers: { cookie } });
		expect((await list.json()) as Envelope).toMatchObject({ data: { media: [{ filename: 'header.png' }] } });
	});

	it('rejects a disallowed MIME type with 415', async () => {
		const form = uploadBody(new Blob(['<script>1</script>'], { type: 'text/html' }), 'page.html');
		const response = await fetchWorker('/api/admin/media', { method: 'POST', headers: { cookie }, body: form });
		expect(response.status).toBe(415);
		expect(((await response.json()) as Envelope).error?.code).toBe('UNSUPPORTED_MEDIA_TYPE');
	});

	it('rejects an unsafe filename with 400', async () => {
		const form = uploadBody(new Blob(['x'], { type: 'image/png' }), 'no spaces here.png');
		const response = await fetchWorker('/api/admin/media', { method: 'POST', headers: { cookie }, body: form });
		expect(response.status).toBe(400);
		expect(((await response.json()) as Envelope).error?.code).toBe('INVALID_FILENAME');
	});

	it('rejects an oversized upload with 413', async () => {
		const big = new Blob(['y'.repeat(11 * 1024 * 1024)], { type: 'image/png' });
		const form = uploadBody(big, 'huge.png');
		const response = await fetchWorker('/api/admin/media', { method: 'POST', headers: { cookie }, body: form });
		expect(response.status).toBe(413);
		expect(((await response.json()) as Envelope).error?.code).toBe('PAYLOAD_TOO_LARGE');
	});
});
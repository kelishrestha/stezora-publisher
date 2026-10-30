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

async function signInAndCookies(): Promise<string> {
	const response = await fetchWorker('/api/auth/sign-in/email', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
	});
	return response.headers.get('set-cookie')?.split(';')[0] ?? '';
}

describe('admin testimonials', () => {
	beforeAll(async () => {
		const now = new Date().toISOString();
		await db
			.prepare('INSERT OR IGNORE INTO user (id, name, email, email_verified, image, created_at, updated_at, role) VALUES (?, ?, ?, 0, NULL, ?, ?, ?)')
			.bind('usr-admin', 'Site Admin', ADMIN_EMAIL, now, now, 'admin')
			.run();
		await db
			.prepare('INSERT OR IGNORE INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
			.bind('acc-admin', 'usr-admin', 'credential', 'usr-admin', ADMIN_HASH, now, now)
			.run();
	});

	it('requires auth for every verb', async () => {
		expect((await fetchWorker('/api/admin/testimonials')).status).toBe(401);
		expect((await fetchWorker('/api/admin/testimonials', { method: 'POST' })).status).toBe(401);
	});

	it('creates, lists, hides, and deletes a testimonial', async () => {
		const cookie = await signInAndCookies();
		const headers = { 'content-type': 'application/json', cookie };

		const create = await fetchWorker('/api/admin/testimonials', {
			method: 'POST',
			headers,
			body: JSON.stringify({ name: 'A Reader', location: 'Everywhere', work: 'The Rebellious Flame', story: 'These poems found me.' }),
		});
		expect(create.status).toBe(201);
		const id = ((await create.json()) as { data: { testimonial: { id: string } } }).data.testimonial.id;

		const list = (await (await fetchWorker('/api/admin/testimonials', { headers: { cookie } })).json()) as { data: { testimonials: Array<{ id: string; visible: number }> } };
		expect(list.data.testimonials.some((t) => t.id === id)).toBe(true);

		// Visible testimonials appear in the public content export.
		const content = (await (await fetchWorker('/api/content')).json()) as { testimonials: Array<{ id: string }> };
		expect(content.testimonials.some((t) => t.id === id)).toBe(true);

		// Hiding it removes it from the public export but keeps the admin row.
		const update = await fetchWorker(`/api/admin/testimonials/${id}`, {
			method: 'PUT',
			headers,
			body: JSON.stringify({ name: 'A Reader', story: 'These poems found me.', visible: false }),
		});
		expect(update.status).toBe(200);
		const hiddenContent = (await (await fetchWorker('/api/content')).json()) as { testimonials: Array<{ id: string }> };
		expect(hiddenContent.testimonials.some((t) => t.id === id)).toBe(false);

		expect((await fetchWorker(`/api/admin/testimonials/${id}`, { method: 'DELETE', headers: { cookie } })).status).toBe(200);
		const after = (await (await fetchWorker('/api/admin/testimonials', { headers: { cookie } })).json()) as { data: { testimonials: Array<{ id: string }> } };
		expect(after.data.testimonials.some((t) => t.id === id)).toBe(false);
	});
});

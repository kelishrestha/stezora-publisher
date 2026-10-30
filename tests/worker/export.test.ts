import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import worker from '../../worker/index';

const db = env.DB;

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'correct-horse-battery-staple';
const ADMIN_HASH =
	'ce018f62e94bb4691067bb9dcd0619af:25c1257d17e89a1312174042b05759811aca8c66a1fcbbb05c87d41b4df1936f8be05b155c4fb30387a417cef6820e3217fd8650d1bbbb592f613cb0e4b0adde';

async function fetchWorker(path: string, init?: RequestInit, extraEnv?: Record<string, string>): Promise<Response> {
	const ctx = createExecutionContext();
	const response = await worker.fetch(new Request(`http://localhost${path}`, init), { ...env, ...extraEnv }, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

describe('backup export API', () => {
	beforeAll(async () => {
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
		await db
			.prepare('INSERT INTO publications (id, name, slug, description, accent, created_at) VALUES (?, ?, ?, NULL, NULL, ?)')
			.bind('pub-x', 'Publication X', 'pub-x', now)
			.run();
		await db
			.prepare(
				"INSERT INTO posts (id, publication_id, title, slug, content, content_markdown, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)"
			)
			.bind('post-draft', 'pub-x', 'Secret draft', 'secret-draft', '<p>raw</p>', 'raw', now)
			.run();
	});

	it('rejects unauthenticated requests', async () => {
		expect((await fetchWorker('/api/export')).status).toBe(401);
		expect(
			(await fetchWorker('/api/export', { headers: { authorization: 'Bearer wrong' } }, { BACKUP_TOKEN: 'right' }))
				.status
		).toBe(401);
	});

	it('streams a zip bundle, drafts included, with the bearer token', async () => {
		const response = await fetchWorker(
			'/api/export',
			{ headers: { authorization: 'Bearer backup-secret' } },
			{ BACKUP_TOKEN: 'backup-secret' }
		);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('application/zip');
		expect(response.headers.get('content-disposition')).toContain('.zip');

		const bytes = new Uint8Array(await response.arrayBuffer());
		// The local file header magic marks a real zip archive.
		expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]);

		// Stored (uncompressed) entries keep their names and JSON in plaintext,
		// so the bundle's shape and the draft row are both visible in the bytes.
		const text = new TextDecoder().decode(bytes);
		for (const name of [
			'manifest.json',
			'data/posts.json',
			'data/likes.json',
			'data/page-views.json',
			'audience/views-by-day.csv',
			'audience/top-posts.csv',
			'analytics/status-by-publication.csv',
			'analytics/posts-by-month.csv',
		]) {
			expect(text).toContain(name);
		}
		expect(text).toContain('stezora-export/3');
		expect(text).toContain('secret-draft');
		expect(text).toContain('"status": "draft"');
	});

	it('accepts an admin session', async () => {
		const signIn = await fetchWorker('/api/auth/sign-in/email', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
		});
		const cookie = signIn.headers.get('set-cookie')?.split(';')[0] ?? '';
		const response = await fetchWorker('/api/export', { headers: { cookie } });
		expect(response.status).toBe(200);
	});
});

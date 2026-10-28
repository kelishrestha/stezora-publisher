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

interface ExportPayload {
	success: boolean;
	data: {
		schema: string;
		counts: Record<string, number>;
		posts: Array<{ id: string; status: string; content_markdown: string | null }>;
		publications: Array<{ id: string }>;
	};
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

	it('exports every table, drafts included, with the bearer token', async () => {
		const response = await fetchWorker(
			'/api/export',
			{ headers: { authorization: 'Bearer backup-secret' } },
			{ BACKUP_TOKEN: 'backup-secret' }
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as ExportPayload;
		expect(body.data.schema).toBe('stezora-export/1');
		const draft = body.data.posts.find((post) => post.id === 'post-draft');
		expect(draft?.status).toBe('draft');
		expect(draft?.content_markdown).toBe('raw');
		expect(body.data.counts.publications).toBeGreaterThan(0);
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

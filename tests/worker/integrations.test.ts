import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import worker from '../../worker/index';

const db = env.DB;

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'correct-horse-battery-staple';
const ADMIN_HASH =
	'ce018f62e94bb4691067bb9dcd0619af:25c1257d17e89a1312174042b05759811aca8c66a1fcbbb05c87d41b4df1936f8be05b155c4fb30387a417cef6820e3217fd8650d1bbbb592f613cb0e4b0adde';

// Blogger credentials may or may not be present in the local .dev.vars, so
// tests that assert on configuration pass an explicit env to stay deterministic.
const ENV_NO_BLOGGER = { ...env, BLOGGER_CLIENT_ID: undefined, BLOGGER_CLIENT_SECRET: undefined, BLOGGER_REFRESH_TOKEN: undefined } as typeof env;

async function fetchWorker(path: string, init?: RequestInit, workerEnv: typeof env = env): Promise<Response> {
	const ctx = createExecutionContext();
	const response = await worker.fetch(new Request(`http://localhost${path}`, init), workerEnv, ctx);
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

interface IntegrationsPayload {
	success: true;
	data: {
		blogger: {
			connected: boolean;
			configured: boolean;
			publications: Array<{ slug: string; blogHost: string | null; linkedPosts: number; stats: { viewsAll: number | null } | null }>;
		};
		neobook: { configured: boolean; profileUrl: string; books: number };
	};
}

describe('GET /api/admin/integrations', () => {
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
		await db.prepare("INSERT INTO publications (id, name, slug, description, created_at) VALUES ('pub-x', 'Pub X', 'pub-x', NULL, ?)").bind(now).run();
		await db
			.prepare(
				"INSERT INTO posts (id, publication_id, title, slug, content, status, created_at, blogger_blog_id, blogger_post_id, canonical_url) VALUES (?, 'pub-x', 'T', 't', '<p>x</p>', 'published', ?, '12345', 'post-1', 'https://pubx.blogspot.com/2020/01/x.html')"
			)
			.bind('p1', now)
			.run();
	});

	it('requires auth', async () => {
		expect((await fetchWorker('/api/admin/integrations')).status).toBe(401);
	});

	it('reports Blogger linkage derived from posts, and the Neobook profile', async () => {
		const cookie = await signInAndCookies();
		const response = await fetchWorker('/api/admin/integrations', { headers: { cookie } });
		expect(response.status).toBe(200);
		const { data } = (await response.json()) as IntegrationsPayload;
		expect(data.blogger.connected).toBe(true);
		const pubX = data.blogger.publications.find((p) => p.slug === 'pub-x');
		expect(pubX).toMatchObject({ blogHost: 'pubx.blogspot.com', linkedPosts: 1 });
		expect(data.neobook.profileUrl).toContain('neobook.org');
		// The Neobook feed is public, so it is always reported configured.
		expect(data.neobook.configured).toBe(true);
	});

	it('reports Blogger as not configured when credentials are absent', async () => {
		const cookie = await signInAndCookies();
		const { data } = (await (await fetchWorker('/api/admin/integrations', { headers: { cookie } }, ENV_NO_BLOGGER)).json()) as IntegrationsPayload;
		expect(data.blogger.configured).toBe(false);
	});

	it('reports the imported book count and blogger stats snapshot', async () => {
		const now = new Date().toISOString();
		await db
			.prepare('INSERT INTO books (id, source, neobook_token, title, created_at) VALUES (?, ?, ?, ?, ?)')
			.bind('b-neobook-tok1', 'neobook', 'tok1', 'A Test Book', now)
			.run();
		await db
			.prepare('INSERT INTO blogger_stats (publication_id, blog_id, views_all, views_30d, views_7d, fetched_at) VALUES (?, ?, ?, ?, ?, ?)')
			.bind('pub-x', '12345', 999, 12, 3, now)
			.run();

		const cookie = await signInAndCookies();
		const { data } = (await (await fetchWorker('/api/admin/integrations', { headers: { cookie } })).json()) as IntegrationsPayload;
		expect(data.neobook.books).toBe(1);
		const pubX = data.blogger.publications.find((p) => p.slug === 'pub-x');
		expect(pubX?.stats?.viewsAll).toBe(999);
	});
});

describe('GET /api/admin/books', () => {
	it('requires auth', async () => {
		expect((await fetchWorker('/api/admin/books')).status).toBe(401);
	});

	it('lists imported books', async () => {
		const now = new Date().toISOString();
		await db
			.prepare('INSERT OR IGNORE INTO books (id, source, neobook_token, title, created_at) VALUES (?, ?, ?, ?, ?)')
			.bind('b-neobook-tok2', 'neobook', 'tok2', 'Another Book', now)
			.run();
		const cookie = await signInAndCookies();
		const response = await fetchWorker('/api/admin/books', { headers: { cookie } });
		expect(response.status).toBe(200);
		const body = (await response.json()) as { data: { books: Array<{ id: string; title: string }> } };
		expect(body.data.books.some((book) => book.id === 'b-neobook-tok2')).toBe(true);
	});
});

describe('POST /api/admin/blogger/import', () => {
	it('requires auth', async () => {
		const response = await fetchWorker('/api/admin/blogger/import', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ includeDrafts: false }),
		});
		expect(response.status).toBe(401);
	});

	it('fails clearly when Blogger credentials are not configured', async () => {
		const cookie = await signInAndCookies();
		const response = await fetchWorker(
			'/api/admin/blogger/import',
			{
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie },
				body: JSON.stringify({ includeDrafts: false }),
			},
			ENV_NO_BLOGGER
		);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { error: { code: string } };
		expect(body.error.code).toBe('blogger_not_configured');
	});
});

describe('POST /api/admin/neobook/sync', () => {
	it('requires auth', async () => {
		expect((await fetchWorker('/api/admin/neobook/sync', { method: 'POST' })).status).toBe(401);
	});
});

describe('POST /api/admin/blogger/stats', () => {
	it('requires auth', async () => {
		expect((await fetchWorker('/api/admin/blogger/stats', { method: 'POST' })).status).toBe(401);
	});

	it('fails clearly when Blogger credentials are not configured', async () => {
		const cookie = await signInAndCookies();
		const response = await fetchWorker('/api/admin/blogger/stats', { method: 'POST', headers: { cookie } }, ENV_NO_BLOGGER);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { error: { code: string } };
		expect(body.error.code).toBe('blogger_not_configured');
	});
});

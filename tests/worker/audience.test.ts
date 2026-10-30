import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import worker from '../../worker/index';

const db = env.DB;

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'correct-horse-battery-staple';
const ADMIN_HASH =
	'ce018f62e94bb4691067bb9dcd0619af:25c1257d17e89a1312174042b05759811aca8c66a1fcbbb05c87d41b4df1936f8be05b155c4fb30387a417cef6820e3217fd8650d1bbbb592f613cb0e4b0adde';

const UA_HUMAN =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

async function fetchWorker(path: string, init?: RequestInit): Promise<Response> {
	const ctx = createExecutionContext();
	const response = await worker.fetch(new Request(`http://localhost${path}`, init), env, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

async function collect(path: string, ua = UA_HUMAN, consent = 'unset'): Promise<Response> {
	return fetchWorker('/api/collect', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'user-agent': ua, 'cf-connecting-ip': '203.0.113.5' },
		body: JSON.stringify({ p: path, r: 'https://news.example/story', consent }),
	});
}

async function signInAndCookies(): Promise<string> {
	const ctx = createExecutionContext();
	const response = await worker.fetch(
		new Request('http://localhost/api/auth/sign-in/email', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
		}),
		env,
		ctx
	);
	await waitOnExecutionContext(ctx);
	const setCookie = response.headers.get('set-cookie');
	if (!setCookie) throw new Error(`sign-in (${response.status}) set no cookie`);
	return setCookie.split(';')[0];
}

interface AudiencePayload {
	success: true;
	data: {
		scope: { publication: string | null; post: string | null; postTitle: string | null };
		totals: { pageviews: number; visitors: number };
		topPublications: Array<{ publication: string | null; name: string | null; views: number }>;
		topPosts: Array<{ publication: string | null; slug: string | null; title: string | null; views: number }>;
		topCountries: Array<{ country: string | null; views: number }>;
		recentVisits: Array<{ createdAt: string; path: string }>;
	};
}

describe('audience analytics', () => {
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
			.prepare("INSERT INTO posts (id, publication_id, title, slug, excerpt, content, status, published_at, created_at) VALUES (?, 'pub-x', ?, 'hello', '', '<p>x</p>', 'published', ?, ?)")
			.bind('post-hello', 'Hello World', now, now)
			.run();
	});

	it('records a human pageview and sets the visitor cookie on granted consent', async () => {
		const response = await collect('/poetry-collections/pub-x/posts/pub-x-hello', UA_HUMAN, 'granted');
		expect(response.status).toBe(204);
		expect(response.headers.get('set-cookie')).toContain('sv_id=');
	});

	it('records the pageview but sets no cookie when consent is declined', async () => {
		const response = await collect('/poetry-collections/pub-x/posts/pub-x-hello', UA_HUMAN, 'denied');
		expect(response.status).toBe(204);
		expect(response.headers.get('set-cookie')).toBeNull();
	});

	it('ignores bot traffic', async () => {
		const before = (await db.prepare('SELECT COUNT(*) AS n FROM page_views').first<{ n: number }>())?.n ?? 0;
		await collect('/poetry-collections/pub-x/posts/pub-x-hello', 'Googlebot/2.1 (+http://www.google.com/bot.html)');
		const after = (await db.prepare('SELECT COUNT(*) AS n FROM page_views').first<{ n: number }>())?.n ?? 0;
		expect(after).toBe(before);
	});

	it('returns the per-post count from /api/views', async () => {
		const response = await fetchWorker('/api/views/pub-x/hello');
		expect(response.status).toBe(200);
		const body = (await response.json()) as { views: number };
		expect(body.views).toBeGreaterThanOrEqual(1);
	});

	it('aggregates audience data for an admin, with the post title resolved', async () => {
		const cookie = await signInAndCookies();
		const response = await fetchWorker('/api/admin/audience?days=30', { headers: { cookie } });
		expect(response.status).toBe(200);
		const body = (await response.json()) as AudiencePayload;
		expect(body.data.totals.pageviews).toBeGreaterThanOrEqual(1);
		const hello = body.data.topPosts.find((p) => p.slug === 'hello');
		expect(hello?.title).toBe('Hello World');
		expect(body.data.recentVisits.length).toBeGreaterThanOrEqual(1);
		expect(body.data.topPublications.find((p) => p.publication === 'pub-x')?.name).toBe('Pub X');
	});

	it('scopes to a single post and resolves its title', async () => {
		const cookie = await signInAndCookies();
		const response = await fetchWorker('/api/admin/audience?publication=pub-x&post=hello', { headers: { cookie } });
		expect(response.status).toBe(200);
		const body = (await response.json()) as AudiencePayload;
		expect(body.data.scope).toMatchObject({ publication: 'pub-x', post: 'hello', postTitle: 'Hello World' });
		expect(body.data.totals.pageviews).toBeGreaterThanOrEqual(1);
	});

	it('scopes to an unknown selection with no data', async () => {
		const cookie = await signInAndCookies();
		const response = await fetchWorker('/api/admin/audience?publication=does-not-exist', { headers: { cookie } });
		expect(response.status).toBe(200);
		const body = (await response.json()) as AudiencePayload;
		expect(body.data.totals.pageviews).toBe(0);
	});

	it('requires an authenticated session for the audience endpoint', async () => {
		expect((await fetchWorker('/api/admin/audience')).status).toBe(401);
	});
});

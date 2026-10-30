import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import worker from '../../worker/index';

const db = env.DB;

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'correct-horse-battery-staple';
// Precomputed BetterAuth scrypt hash (matches scripts/db/password.ts).
const ADMIN_HASH =
	'ce018f62e94bb4691067bb9dcd0619af:25c1257d17e89a1312174042b05759811aca8c66a1fcbbb05c87d41b4df1936f8be05b155c4fb30387a417cef6820e3217fd8650d1bbbb592f613cb0e4b0adde';

interface AnalyticsResponse {
	success: true;
	data: {
		totals: { publications: number; posts: number; published: number; firstPublished: string | null; lastPublished: string | null };
		statusByPublication: Array<{ slug: string; name: string; draft: number; scheduled: number; published: number; archived: number }>;
		postsByMonth: Array<{ month: string; count: number }>;
		media: { total: number; localized: number; external: number; totalBytes: number };
	};
}

async function fetchWorker(path: string, init?: RequestInit): Promise<Response> {
	const ctx = createExecutionContext();
	const response = await worker.fetch(new Request(`http://localhost${path}`, init), env, ctx);
	await waitOnExecutionContext(ctx);
	return response;
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
	if (!setCookie) throw new Error(`sign-in (${response.status}) set no cookie: ${await response.text()}`);
	return setCookie.split(';')[0];
}

async function seedPost(options: {
	id: string;
	slug: string;
	status: string;
	publishedAt: string | null;
}): Promise<void> {
	await db
		.prepare(
			`INSERT INTO posts (id, publication_id, title, slug, excerpt, content, status, published_at, updated_at, created_at)
			 VALUES (?, 'pub-x', ?, ?, '', '<p>body</p>', ?, ?, ?, ?)`
		)
		.bind(options.id, `Title ${options.slug}`, options.slug, options.status, options.publishedAt, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
		.run();
}

async function seedMedia(id: string, postId: string, r2Key: string | null, sourceUrl: string | null, size: number): Promise<void> {
	await db
		.prepare(
			'INSERT INTO media (id, post_id, publication_id, r2_key, source_url, filename, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
		)
		.bind(id, postId, 'pub-x', r2Key, sourceUrl, `${id}.png`, 'image/png', size, '2026-01-01T00:00:00.000Z')
		.run();
}

describe('GET /api/admin/analytics', () => {
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

		await db.prepare("INSERT INTO publications (id, name, slug, description, created_at) VALUES ('pub-x', 'Pub X', 'pub-x', NULL, ?)").bind(now).run();

		await seedPost({ id: 'p1', slug: 'p1', status: 'published', publishedAt: '2024-01-15T00:00:00.000Z' });
		await seedPost({ id: 'p2', slug: 'p2', status: 'published', publishedAt: '2024-01-20T00:00:00.000Z' });
		await seedPost({ id: 'p3', slug: 'p3', status: 'published', publishedAt: '2024-03-02T00:00:00.000Z' });
		await seedPost({ id: 'p4', slug: 'p4', status: 'draft', publishedAt: null });
		await seedPost({ id: 'p5', slug: 'p5', status: 'scheduled', publishedAt: '2026-05-01T00:00:00.000Z' });
		await seedPost({ id: 'p6', slug: 'p6', status: 'archived', publishedAt: '2023-01-01T00:00:00.000Z' });

		await seedMedia('m1', 'p1', 'localized/m1.png', null, 1000);
		await seedMedia('m2', 'p2', null, 'https://example.com/x.png', 500);
	});

	it('requires an authenticated session', async () => {
		expect((await fetchWorker('/api/admin/analytics')).status).toBe(401);
	});

	it('aggregates status, cadence, and media from content metadata', async () => {
		const cookie = await signInAndCookies();
		const response = await fetchWorker('/api/admin/analytics', { headers: { cookie } });
		expect(response.status).toBe(200);
		const { data } = (await response.json()) as AnalyticsResponse;

		// Status counts per publication.
		const pubX = data.statusByPublication.find((row) => row.slug === 'pub-x');
		expect(pubX).toMatchObject({ published: 3, draft: 1, scheduled: 1, archived: 1 });

		// Cadence only counts published posts with a date, grouped by month.
		expect(data.postsByMonth).toEqual([
			{ month: '2024-01', count: 2 },
			{ month: '2024-03', count: 1 },
		]);

		// Media split: one localized (r2_key), one external (source_url only).
		expect(data.media).toMatchObject({ total: 2, localized: 1, external: 1, totalBytes: 1500 });

		// Totals.
		expect(data.totals).toMatchObject({
			publications: 1,
			posts: 6,
			published: 3,
			firstPublished: '2024-01-15T00:00:00.000Z',
			lastPublished: '2024-03-02T00:00:00.000Z',
		});
	});
});

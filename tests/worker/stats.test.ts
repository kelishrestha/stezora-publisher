import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import worker from '../../worker/index';

const db = env.DB;

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'correct-horse-battery-staple';
// Precomputed BetterAuth scrypt hash for ADMIN_EMAIL / ADMIN_PASSWORD
// (matches scripts/db/password.ts; reused from auth.test.ts).
const ADMIN_HASH =
	'ce018f62e94bb4691067bb9dcd0619af:25c1257d17e89a1312174042b05759811aca8c66a1fcbbb05c87d41b4df1936f8be05b155c4fb30387a417cef6820e3217fd8650d1bbbb592f613cb0e4b0adde';

interface StatsResponse {
	success: true;
	data: {
		publications: Array<{
			slug: string;
			name: string;
			draft: number;
			scheduled: number;
			published: number;
			archived: number;
		}>;
		totalMedia: number;
		recentPosts: Array<{ id: string; title: string; slug: string; publication: string; status: string; publishedAt: string | null }>;
	};
}

async function fetchWorker(path: string, init?: RequestInit): Promise<Response> {
	const ctx = createExecutionContext();
	const response = await worker.fetch(new Request(`http://localhost${path}`, init), env, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

async function seedReferenceData(): Promise<void> {
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
	if (!setCookie) {
		throw new Error(`sign-in (${response.status}) did not set a session cookie: ${await response.text()}`);
	}
	return setCookie.split(';')[0];
}

async function seedPublication(id: string, slug: string, name: string): Promise<void> {
	await db
		.prepare('INSERT INTO publications (id, name, slug, description, created_at) VALUES (?, ?, ?, NULL, ?)')
		.bind(id, name, slug, new Date().toISOString())
		.run();
}

async function seedPost(options: {
	id: string;
	publicationId: string;
	slug: string;
	status: string;
	publishedAt: string | null;
	updatedAt: string;
}): Promise<void> {
	const { id, publicationId, slug, status, publishedAt, updatedAt } = options;
	await db
		.prepare(
			`INSERT INTO posts (id, publication_id, title, slug, excerpt, content, status, published_at, updated_at, created_at)
			 VALUES (?, ?, ?, ?, ?, '<p>body</p>', ?, ?, ?, ?)`
		)
		.bind(id, publicationId, `Title ${slug}`, slug, `Excerpt ${slug}`, status, publishedAt, updatedAt, updatedAt)
		.run();
}

async function seedMedia(id: string, postId: string | null, r2Key: string): Promise<void> {
	await db
		.prepare(
			'INSERT INTO media (id, post_id, r2_key, filename, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
		)
		.bind(id, postId, r2Key, `${id}.png`, 'image/png', 1024, new Date().toISOString())
		.run();
}

describe('GET /api/admin/stats', () => {
	beforeAll(async () => {
		await seedReferenceData();
	});

	it('returns counts scoped per publication with statuses separated', async () => {
		await seedPublication('pub-a', 'pub-a', 'Publication A');
		await seedPublication('pub-b', 'pub-b', 'Publication B');
		await seedPublication('pub-c', 'pub-c', 'Publication C');

		await seedPost({
			id: 'p-a-draft',
			publicationId: 'pub-a',
			slug: 'a-draft',
			status: 'draft',
			publishedAt: null,
			updatedAt: '2026-01-10T00:00:00.000Z',
		});
		await seedPost({
			id: 'p-a-1',
			publicationId: 'pub-a',
			slug: 'a-published-1',
			status: 'published',
			publishedAt: '2026-01-11T00:00:00.000Z',
			updatedAt: '2026-01-11T00:00:00.000Z',
		});
		await seedPost({
			id: 'p-a-2',
			publicationId: 'pub-a',
			slug: 'a-published-2',
			status: 'published',
			publishedAt: '2026-01-12T00:00:00.000Z',
			updatedAt: '2026-01-12T00:00:00.000Z',
		});
		await seedPost({
			id: 'p-b-sch',
			publicationId: 'pub-b',
			slug: 'b-scheduled',
			status: 'scheduled',
			publishedAt: '2026-02-01T00:00:00.000Z',
			updatedAt: '2026-01-13T00:00:00.000Z',
		});
		await seedPost({
			id: 'p-b-arch',
			publicationId: 'pub-b',
			slug: 'b-archived',
			status: 'archived',
			publishedAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-14T00:00:00.000Z',
		});
		await seedMedia('m-a-1', 'p-a-1', 'a/one.png');
		await seedMedia('m-a-2', null, 'a/two.png');

		const cookie = await signInAndCookies();
		const response = await fetchWorker('/api/admin/stats', { headers: { cookie } });

		expect(response.status).toBe(200);
		const body = (await response.json()) as StatsResponse;

		const bySlug = new Map(body.data.publications.map((publication) => [publication.slug, publication]));
		expect(bySlug.get('pub-a')).toMatchObject({ slug: 'pub-a', draft: 1, scheduled: 0, published: 2, archived: 0 });
		expect(bySlug.get('pub-b')).toMatchObject({ slug: 'pub-b', draft: 0, scheduled: 1, published: 0, archived: 1 });
		expect(bySlug.get('pub-c')).toMatchObject({ slug: 'pub-c', draft: 0, scheduled: 0, published: 0, archived: 0 });

		expect(body.data.totalMedia).toBe(2);
	});

	it('lists recent posts most recently touched first', async () => {
		await seedPublication('pub-r', 'pub-r', 'Publication R');
		await seedPost({
			id: 'p-r-1',
			publicationId: 'pub-r',
			slug: 'r-1',
			status: 'published',
			publishedAt: '2026-03-01T00:00:00.000Z',
			updatedAt: '2026-03-05T00:00:00.000Z',
		});
		await seedPost({
			id: 'p-r-2',
			publicationId: 'pub-r',
			slug: 'r-2',
			status: 'published',
			publishedAt: '2026-03-02T00:00:00.000Z',
			updatedAt: '2026-03-04T00:00:00.000Z',
		});
		await seedPost({
			id: 'p-r-3',
			publicationId: 'pub-r',
			slug: 'r-3',
			status: 'draft',
			publishedAt: null,
			updatedAt: '2026-03-03T00:00:00.000Z',
		});

		const cookie = await signInAndCookies();
		const response = await fetchWorker('/api/admin/stats', { headers: { cookie } });
		expect(response.status).toBe(200);
		const body = (await response.json()) as StatsResponse;

		expect(body.data.recentPosts.slice(0, 3).map((post) => post.id)).toEqual(['p-r-1', 'p-r-2', 'p-r-3']);
		expect(body.data.recentPosts[0]).toMatchObject({
			id: 'p-r-1',
			slug: 'r-1',
			publication: 'pub-r',
			status: 'published',
		});
	});

	it('requires an authenticated session', async () => {
		const response = await fetchWorker('/api/admin/stats');

		expect(response.status).toBe(401);
	});
});
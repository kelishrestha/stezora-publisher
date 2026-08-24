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

async function seedPublications(): Promise<void> {
	const now = new Date().toISOString();
	for (const [id, slug, name, accent] of [
		['pub-a', 'pub-a', 'Publication A', 'dark-amaranth'],
		['pub-b', 'pub-b', 'Publication B', 'bright-amber'],
		['pub-c', 'pub-c', 'Publication C', 'soft-periwinkle'],
	] as const) {
		await db
			.prepare(
				'INSERT INTO publications (id, name, slug, description, accent, created_at) VALUES (?, ?, ?, NULL, ?, ?)'
			)
			.bind(id, name, slug, accent, now)
			.run();
	}
}

interface Envelope {
	success?: boolean;
	data?: Record<string, unknown>;
	error?: { code?: string; message?: string };
}

function postPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		publicationId: 'pub-a',
		title: 'A test post',
		contentMarkdown: '## Heading\n\nBody text.',
		status: 'draft',
		tagNames: [],
		...overrides,
	};
}

describe('admin tags API', () => {
	let cookie: string;

	beforeAll(async () => {
		await seedAdminUser();
		await seedPublications();
		cookie = await signInAndCookies();
	});

	it('requires authentication for every endpoint', async () => {
		expect((await fetchWorker('/api/admin/tags')).status).toBe(401);
		expect((await fetchWorker('/api/admin/tags', { method: 'POST', body: '{}' })).status).toBe(401);
	});

	it('creates tags scoped to a publication and rejects duplicate slugs in it', async () => {
		const headers = { cookie, 'content-type': 'application/json' };

		const created = await fetchWorker('/api/admin/tags', {
			method: 'POST',
			headers,
			body: JSON.stringify({ publicationId: 'pub-a', name: 'Poetry' }),
		});
		expect(created.status).toBe(201);
		const body = (await created.json()) as Envelope;
		const tag = body.data?.tag as { id: string; publication_id: string; slug: string } | undefined;
		expect(tag?.slug).toBe('poetry');
		expect(tag?.publication_id).toBe('pub-a');

		// Same slug under a different publication is allowed.
		const other = await fetchWorker('/api/admin/tags', {
			method: 'POST',
			headers,
			body: JSON.stringify({ publicationId: 'pub-b', name: 'Poetry' }),
		});
		expect(other.status).toBe(201);

		// Duplicate slug within the same publication is rejected.
		const duplicate = await fetchWorker('/api/admin/tags', {
			method: 'POST',
			headers,
			body: JSON.stringify({ publicationId: 'pub-a', name: 'Poetry' }),
		});
		expect(duplicate.status).toBe(409);
		expect(((await duplicate.json()) as Envelope).error?.code).toBe('SLUG_CONFLICT');
	});

	it('updates and deletes an unreferenced tag', async () => {
		const headers = { cookie, 'content-type': 'application/json' };
		const created = await fetchWorker('/api/admin/tags', {
			method: 'POST',
			headers,
			body: JSON.stringify({ publicationId: 'pub-a', name: 'Essays' }),
		});
		const createdBody = (await created.json()) as Envelope;
		const id = (createdBody.data?.tag as { id: string }).id;

		const updated = await fetchWorker(`/api/admin/tags/${id}`, {
			method: 'PUT',
			headers,
			body: JSON.stringify({ name: 'Long Essays' }),
		});
		expect(updated.status).toBe(200);
		expect(((await updated.json()) as Envelope).data?.tag).toMatchObject({ name: 'Long Essays' });

		const deleted = await fetchWorker(`/api/admin/tags/${id}`, { method: 'DELETE', headers: { cookie } });
		expect(deleted.status).toBe(200);
	});

	it('blocks deleting a tag still referenced by a post (409 IN_USE)', async () => {
		const headers = { cookie, 'content-type': 'application/json' };
		const created = await fetchWorker('/api/admin/tags', {
			method: 'POST',
			headers,
			body: JSON.stringify({ publicationId: 'pub-a', name: 'Featured' }),
		});
		const createdBody = (await created.json()) as Envelope;
		const tagId = (createdBody.data?.tag as { id: string }).id;

		const postResponse = await fetchWorker('/api/admin/posts', {
			method: 'POST',
			headers,
			body: JSON.stringify(postPayload({ title: 'Featured post', tagNames: ['Featured'] })),
		});
		expect(postResponse.status).toBe(201);

		const deleted = await fetchWorker(`/api/admin/tags/${tagId}`, { method: 'DELETE', headers: { cookie } });
		expect(deleted.status).toBe(409);
		expect(((await deleted.json()) as Envelope).error?.code).toBe('IN_USE');
	});

	it('keeps same-named tags scoped per publication and blocks deletion while referenced', async () => {
		const headers = { cookie, 'content-type': 'application/json' };
		const created = await fetchWorker('/api/admin/tags', {
			method: 'POST',
			headers,
			body: JSON.stringify({ publicationId: 'pub-a', name: 'Shared' }),
		});
		const tagA = ((await created.json()) as Envelope).data?.tag as { id: string; publication_id: string };

		// Same tag name in a different publication is its own row.
		const createdB = await fetchWorker('/api/admin/tags', {
			method: 'POST',
			headers,
			body: JSON.stringify({ publicationId: 'pub-b', name: 'Shared' }),
		});
		const tagB = ((await createdB.json()) as Envelope).data?.tag as { id: string; publication_id: string };
		expect(tagA.publication_id).not.toBe(tagB.publication_id);

		// Each post resolves its tag within its own publication.
		const postA = await fetchWorker('/api/admin/posts', {
			method: 'POST',
			headers,
			body: JSON.stringify(postPayload({ title: 'A', tagNames: ['Shared'] })),
		});
		const postB = await fetchWorker('/api/admin/posts', {
			method: 'POST',
			headers,
			body: JSON.stringify(postPayload({ publicationId: 'pub-b', title: 'B', tagNames: ['Shared'] })),
		});
		expect(postA.status).toBe(201);
		expect(postB.status).toBe(201);

		// Deleting a tag is blocked while it is referenced.
		const deleted = await fetchWorker(`/api/admin/tags/${tagA.id}`, { method: 'DELETE', headers: { cookie } });
		expect(deleted.status).toBe(409);
		expect(((await deleted.json()) as Envelope).error?.code).toBe('IN_USE');

		// Editor meta exposes both publications and both publications' tags.
		const meta = await fetchWorker('/api/admin/posts/meta', { headers: { cookie } });
		const metaBody = (await meta.json()) as Envelope;
		expect(metaBody.data?.tags).toContainEqual(expect.objectContaining({ name: 'Shared' }));
	});

	it('lists tags scoped to a publication', async () => {
		const headers = { cookie, 'content-type': 'application/json' };
		await fetchWorker('/api/admin/tags', {
			method: 'POST',
			headers,
			body: JSON.stringify({ publicationId: 'pub-a', name: 'Scoped A' }),
		});
		await fetchWorker('/api/admin/tags', {
			method: 'POST',
			headers,
			body: JSON.stringify({ publicationId: 'pub-b', name: 'Scoped B' }),
		});

		const listA = await fetchWorker('/api/admin/tags?publicationId=pub-a', { headers: { cookie } });
		const bodyA = (await listA.json()) as Envelope;
		const tagsA = bodyA.data?.tags as Array<{ name: string }>;
		expect(tagsA.find((t) => t.name === 'Scoped A')).toBeTruthy();
		expect(tagsA.find((t) => t.name === 'Scoped B')).toBeFalsy();
	});
});

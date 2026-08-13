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

interface PostBody {
	id: string;
	publicationId: string;
	publication: string;
	title: string;
	slug: string;
	excerpt: string;
	content: string;
	contentMarkdown: string;
	categoryId: string | null;
	category: string | null;
	tags: string[];
	status: string;
	publishedAt: string | null;
	updatedAt: string | null;
	seoTitle: string | null;
	seoDescription: string | null;
	canonicalUrl: string | null;
	bloggerBlogId: string | null;
	bloggerPostId: string | null;
	createdAt: string;
}

interface Envelope {
	success: boolean;
	data?: { post?: PostBody; posts?: PostBody[]; html?: string; title?: string; publications?: unknown[]; categories?: unknown[]; tags?: unknown[] };
	error?: { code: string; message: string };
}

function postPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		publicationId: 'pub-a',
		title: 'A test post',
		contentMarkdown: '## Heading\n\nSome **bold** text and <script>alert(1)</script>.',
		status: 'draft',
		tagNames: ['poetry', 'draft'],
		...overrides,
	};
}

describe('admin posts editor API', () => {
	let cookie: string;

	beforeAll(async () => {
		await seedAdminUser();
		await seedPublications();
		cookie = await signInAndCookies();
	});

	it('requires authentication for every endpoint', async () => {
		const unauth = await fetchWorker('/api/admin/posts');
		expect(unauth.status).toBe(401);

		const meta = await fetchWorker('/api/admin/posts/meta');
		expect(meta.status).toBe(401);

		const create = await fetchWorker('/api/admin/posts', { method: 'POST', body: '{}' });
		expect(create.status).toBe(401);
	});

	it('exposes editor metadata (publications, categories, tags)', async () => {
		const response = await fetchWorker('/api/admin/posts/meta', { headers: { cookie } });
		expect(response.status).toBe(200);
		const body = (await response.json()) as Envelope;
		expect(body.data?.publications).toHaveLength(3);
		const accents = body.data?.publications?.map((p) => (p as { accent: string }).accent).sort();
		expect(accents).toEqual(['bright-amber', 'dark-amaranth', 'soft-periwinkle']);
	});

	it('creates a post with a sanitized content, generated slug, and tags', async () => {
		const response = await fetchWorker('/api/admin/posts', {
			method: 'POST',
			headers: { cookie, 'content-type': 'application/json' },
			body: JSON.stringify(postPayload()),
		});
		expect(response.status).toBe(201);
		const body = (await response.json()) as Envelope;
		const post = body.data?.post;
		expect(post?.title).toBe('A test post');
		expect(post?.slug).toBe('a-test-post');
		expect(post?.status).toBe('draft');
		expect(post?.content).not.toContain('<script');
		expect(post?.content).toContain('<h2>Heading</h2>');
		expect(post?.content).toContain('<strong>bold</strong>');
		expect(post?.contentMarkdown).toContain('**bold**');
		expect(post?.tags.sort()).toEqual(['draft', 'poetry']);

		// Created post is a draft: never visible through the public export.
		const publicResponse = await fetchWorker('/api/content');
		const publicBody = (await publicResponse.json()) as { posts: Array<{ slug: string }> };
		expect(publicBody.posts.map((p) => p.slug)).not.toContain('a-test-post');
	});

	it('auto-generates a slug from the title when none is supplied', async () => {
		const response = await fetchWorker('/api/admin/posts', {
			method: 'POST',
			headers: { cookie, 'content-type': 'application/json' },
			body: JSON.stringify(postPayload({ title: 'Hello World', slug: '' })),
		});
		expect(response.status).toBe(201);
		const body = (await response.json()) as Envelope;
		expect(body.data?.post?.slug).toBe('hello-world');
	});

	it('rejects a slug matching the publication slug', async () => {
		const response = await fetchWorker('/api/admin/posts', {
			method: 'POST',
			headers: { cookie, 'content-type': 'application/json' },
			body: JSON.stringify(postPayload({ slug: 'pub-a' })),
		});
		expect(response.status).toBe(400);
		const body = (await response.json()) as Envelope;
		expect(body.error?.code).toBe('VALIDATION_ERROR');
	});

	it('rejects a duplicate slug within a publication', async () => {
		const first = await fetchWorker('/api/admin/posts', {
			method: 'POST',
			headers: { cookie, 'content-type': 'application/json' },
			body: JSON.stringify(postPayload({ title: 'Duplicate' })),
		});
		expect(first.status).toBe(201);

		const second = await fetchWorker('/api/admin/posts', {
			method: 'POST',
			headers: { cookie, 'content-type': 'application/json' },
			body: JSON.stringify(postPayload({ title: 'Duplicate' })),
		});
		expect(second.status).toBe(409);
		const body = (await second.json()) as Envelope;
		expect(body.error?.code).toBe('SLUG_CONFLICT');
	});

	it('rejects an unknown publication', async () => {
		const response = await fetchWorker('/api/admin/posts', {
			method: 'POST',
			headers: { cookie, 'content-type': 'application/json' },
			body: JSON.stringify(postPayload({ publicationId: 'nope' })),
		});
		expect(response.status).toBe(400);
		const body = (await response.json()) as Envelope;
		expect(body.error?.code).toBe('UNKNOWN_PUBLICATION');
	});

	it('gets, updates, re-sanitizes, and lists posts', async () => {
		const created = await fetchWorker('/api/admin/posts', {
			method: 'POST',
			headers: { cookie, 'content-type': 'application/json' },
			body: JSON.stringify(postPayload({ title: 'Update me', tagNames: ['one'] })),
		});
		const createdBody = (await created.json()) as Envelope;
		const id = createdBody.data?.post?.id as string;

		const getResponse = await fetchWorker(`/api/admin/posts/${id}`, { headers: { cookie } });
		expect(getResponse.status).toBe(200);
		expect(((await getResponse.json()) as Envelope).data?.post?.id).toBe(id);

		// Re-save with malicious markdown: stored content must stay sanitized
		// (DEVELOPER.md §83 rule 1 — every write path re-sanitizes).
		const updateResponse = await fetchWorker(`/api/admin/posts/${id}`, {
			method: 'PUT',
			headers: { cookie, 'content-type': 'application/json' },
			body: JSON.stringify(
				postPayload({
					title: 'Updated title',
					contentMarkdown: 'Line\n\n<img src=x onerror=alert(1)> and [x](javascript:alert(1))',
					tagNames: ['one', 'two'],
				})
			),
		});
		expect(updateResponse.status).toBe(200);
		const updated = (await updateResponse.json()) as Envelope;
		expect(updated.data?.post?.title).toBe('Updated title');
		expect(updated.data?.post?.content).not.toContain('onerror');
		expect(updated.data?.post?.content).not.toContain('javascript:');
		expect(updated.data?.post?.tags.sort()).toEqual(['one', 'two']);

		const listResponse = await fetchWorker('/api/admin/posts', { headers: { cookie } });
		const listBody = (await listResponse.json()) as Envelope;
		expect(listBody.data?.posts?.map((p) => p.id)).toContain(id);
	});

	it('publishes a post idempotently', async () => {
		const created = await fetchWorker('/api/admin/posts', {
			method: 'POST',
			headers: { cookie, 'content-type': 'application/json' },
			body: JSON.stringify(postPayload({ title: 'Publish me', status: 'draft' })),
		});
		const createdBody = (await created.json()) as Envelope;
		const id = createdBody.data?.post?.id as string;

		const publishOne = await fetchWorker(`/api/admin/posts/${id}/publish`, { method: 'POST', headers: { cookie } });
		expect(publishOne.status).toBe(200);
		const published = (await publishOne.json()) as Envelope;
		expect(published.data?.post?.status).toBe('published');
		const publishedAt = published.data?.post?.publishedAt;
		expect(publishedAt).toBeTruthy();

		// Re-publish: status stays published, published_at is not rewritten.
		const publishTwo = await fetchWorker(`/api/admin/posts/${id}/publish`, { method: 'POST', headers: { cookie } });
		const republished = (await publishTwo.json()) as Envelope;
		expect(republished.data?.post?.status).toBe('published');
		expect(republished.data?.post?.publishedAt).toBe(publishedAt);

		// Published post now appears in the public export.
		const publicResponse = await fetchWorker('/api/content');
		const publicBody = (await publicResponse.json()) as { posts: Array<{ slug: string }> };
		expect(publicBody.posts.map((p) => p.slug)).toContain('publish-me');
	});

	it('previews draft content through the shared pipeline with auth', async () => {
		const created = await fetchWorker('/api/admin/posts', {
			method: 'POST',
			headers: { cookie, 'content-type': 'application/json' },
			body: JSON.stringify(postPayload({ title: 'Preview me', contentMarkdown: '## Draft body' })),
		});
		const createdBody = (await created.json()) as Envelope;
		const id = createdBody.data?.post?.id as string;

		const unauthPreview = await fetchWorker(`/api/admin/posts/${id}/preview`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({}),
		});
		expect(unauthPreview.status).toBe(401);

		const preview = await fetchWorker(`/api/admin/posts/${id}/preview`, {
			method: 'POST',
			headers: { cookie, 'content-type': 'application/json' },
			body: JSON.stringify({ contentMarkdown: '## Fresh **unsaved** content' }),
		});
		expect(preview.status).toBe(200);
		const body = (await preview.json()) as Envelope;
		expect(body.data?.html).toContain('<h2>Fresh');
		expect(body.data?.html).toContain('<strong>unsaved</strong>');
		expect(body.data?.title).toBe('Preview me');
	});

	it('deletes a post', async () => {
		const created = await fetchWorker('/api/admin/posts', {
			method: 'POST',
			headers: { cookie, 'content-type': 'application/json' },
			body: JSON.stringify(postPayload({ title: 'Delete me' })),
		});
		const createdBody = (await created.json()) as Envelope;
		const id = createdBody.data?.post?.id as string;

		const deleteResponse = await fetchWorker(`/api/admin/posts/${id}`, { method: 'DELETE', headers: { cookie } });
		expect(deleteResponse.status).toBe(200);

		const getResponse = await fetchWorker(`/api/admin/posts/${id}`, { headers: { cookie } });
		expect(getResponse.status).toBe(404);
	});
});

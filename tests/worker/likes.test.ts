import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import worker from '../../worker/index';

const db = env.DB;

async function fetchWorker(path: string, init?: RequestInit): Promise<Response> {
	const ctx = createExecutionContext();
	const response = await worker.fetch(new Request(`http://localhost${path}`, init), env, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

interface LikeData {
	app: number;
	integration: number;
	total: number;
	liked: boolean;
}

async function summary(path: string, init?: RequestInit): Promise<LikeData> {
	return ((await (await fetchWorker(path, init)).json()) as { data: LikeData }).data;
}

describe('likes', () => {
	beforeAll(async () => {
		const now = new Date().toISOString();
		await db.prepare("INSERT OR IGNORE INTO publications (id, name, slug, description, created_at) VALUES ('pub-like', 'Pub Like', 'pub-like', NULL, ?)").bind(now).run();
		await db
			.prepare(
				"INSERT OR IGNORE INTO posts (id, publication_id, title, slug, content, status, created_at, neobook_likes, neobook_url) VALUES (?, 'pub-like', 'Hello', 'hello', '<p>x</p>', 'published', ?, 3, 'https://neobook.org/poem/x/')"
			)
			.bind('p-like-1', now)
			.run();
	});

	it('rejects an unknown entity type', async () => {
		expect((await fetchWorker('/api/likes/widget/foo')).status).toBe(400);
	});

	it('combines app likes with integration (Neobook) likes and toggles', async () => {
		// Integration likes (3) show before anyone likes in-app.
		const before = await summary('/api/likes/post/pub-like/hello');
		expect(before).toMatchObject({ app: 0, integration: 3, total: 3, liked: false });

		// Liking adds one app like (visitor identified by the daily hash in tests).
		const liked = await summary('/api/likes/post/pub-like/hello', { method: 'POST' });
		expect(liked).toMatchObject({ app: 1, liked: true });

		const afterLike = await summary('/api/likes/post/pub-like/hello');
		expect(afterLike).toMatchObject({ app: 1, integration: 3, total: 4, liked: true });

		// Liking again toggles it off.
		const unliked = await summary('/api/likes/post/pub-like/hello', { method: 'POST' });
		expect(unliked).toMatchObject({ app: 0, liked: false });
	});

	it('aggregates a publication integration likes from its posts', async () => {
		const result = await summary('/api/likes/publication/pub-like');
		expect(result.integration).toBe(3);
	});
});

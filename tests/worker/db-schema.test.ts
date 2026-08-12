import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';

const db = env.DB;

async function seedPublication(id: string): Promise<void> {
	await db
		.prepare(
			'INSERT INTO publications (id, name, slug, description, created_at) VALUES (?, ?, ?, NULL, ?)'
		)
		.bind(id, id, id, new Date().toISOString())
		.run();
}

async function insertPost(options: {
	publication: string;
	slug: string;
	blogId?: string | null;
	bloggerPostId?: string | null;
}): Promise<void> {
	await db
		.prepare(
			`INSERT INTO posts (id, publication_id, title, slug, content, status, blogger_blog_id, blogger_post_id, created_at)
			 VALUES (?, ?, ?, ?, 'content', 'published', ?, ?, ?)`
		)
		.bind(
			`p-${options.publication}-${options.slug}`,
			options.publication,
			options.slug,
			options.slug,
			options.blogId ?? null,
			options.bloggerPostId ?? null,
			new Date().toISOString()
		)
		.run();
}

describe('d1 schema constraints', () => {
	it('rejects duplicate publication slugs', async () => {
		await seedPublication('pub-duplicate-slug');
		await expect(seedPublication('pub-duplicate-slug')).rejects.toThrow();
	});

	it('rejects duplicate (publication_id, slug) post pairs', async () => {
		await seedPublication('pub-duplicate-post-slug');
		await insertPost({ publication: 'pub-duplicate-post-slug', slug: 'hello' });
		await expect(
			insertPost({ publication: 'pub-duplicate-post-slug', slug: 'hello' })
		).rejects.toThrow();
	});

	it('allows the same post slug in different publications', async () => {
		await seedPublication('pub-same-slug-a');
		await seedPublication('pub-same-slug-b');
		await insertPost({ publication: 'pub-same-slug-a', slug: 'hello' });
		await insertPost({ publication: 'pub-same-slug-b', slug: 'hello' });
	});

	it('rejects duplicate (blogger_blog_id, blogger_post_id) pairs', async () => {
		await seedPublication('pub-duplicate-blogger');
		await insertPost({
			publication: 'pub-duplicate-blogger',
			slug: 'one',
			blogId: '123',
			bloggerPostId: 'abc',
		});
		await expect(
			insertPost({
				publication: 'pub-duplicate-blogger',
				slug: 'two',
				blogId: '123',
				bloggerPostId: 'abc',
			})
		).rejects.toThrow();
	});

	it('allows two posts with NULL Blogger ids', async () => {
		await seedPublication('pub-null-blogger');
		await insertPost({ publication: 'pub-null-blogger', slug: 'one', blogId: null, bloggerPostId: null });
		await insertPost({ publication: 'pub-null-blogger', slug: 'two', blogId: null, bloggerPostId: null });
	});
});

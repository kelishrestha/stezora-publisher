import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import worker from '../../worker/index';

const db = env.DB;

const contentPostSchema = z.object({
	title: z.string(),
	excerpt: z.string(),
	publication: z.string(),
	category: z.string(),
	tags: z.array(z.string()).default([]),
	pubDate: z.coerce.date(),
	updatedDate: z.coerce.date().optional(),
	status: z.enum(['published', 'draft']).default('published'),
	content: z.string(),
	bloggerPostId: z.string().optional(),
	bloggerUrl: z.url().optional(),
});

interface ContentResponse {
	publications: Array<{ id: string; name: string; slug: string; description: string | null; accent: string | null }>;
	posts: Array<Record<string, unknown>>;
	categories: Array<{ id: string; publication_id: string; name: string; slug: string }>;
	tags: Array<{ id: string; name: string; slug: string }>;
}

async function seedPublication(id: string, slug = id, accent: string | null = null): Promise<void> {
	await db
		.prepare(
			'INSERT INTO publications (id, name, slug, description, accent, created_at) VALUES (?, ?, ?, ?, ?, ?)'
		)
		.bind(id, `Name ${id}`, slug, `Description ${id}`, accent, new Date().toISOString())
		.run();
}

async function seedPost(options: {
	publication: string;
	slug: string;
	status: string;
	publishedAt: string;
	categoryId?: string;
	bloggerPostId?: string;
	canonicalUrl?: string;
	tagSlugs?: string[];
}): Promise<void> {
	const { publication, slug, status, publishedAt, categoryId } = options;
	await db
		.prepare(
			`INSERT INTO posts (id, publication_id, category_id, title, slug, excerpt, content, status, published_at, updated_at, canonical_url, blogger_post_id, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, '<p>body</p>', ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			`p-${publication}-${slug}`,
			publication,
			categoryId ?? null,
			`Title ${slug}`,
			slug,
			`Excerpt ${slug}`,
			status,
			publishedAt,
			publishedAt,
			options.canonicalUrl ?? null,
			options.bloggerPostId ?? null,
			new Date().toISOString()
		)
		.run();

	for (const tagSlug of options.tagSlugs ?? []) {
		await db
			.prepare('INSERT OR IGNORE INTO tags (id, name, slug) VALUES (?, ?, ?)')
			.bind(`t-${tagSlug}`, `Tag ${tagSlug}`, tagSlug)
			.run();
		await db
			.prepare('INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)')
			.bind(`p-${publication}-${slug}`, `t-${tagSlug}`)
			.run();
	}
}

async function fetchContent(): Promise<ContentResponse> {
	const ctx = createExecutionContext();
	const res = await worker.fetch(new Request('http://localhost/api/content'), env, ctx);
	await waitOnExecutionContext(ctx);
	expect(res.status).toBe(200);
	expect(res.headers.get('content-type')).toMatch(/^application\/json/);
	expect(res.headers.get('cache-control')).toBe('public, max-age=60');
	return (await res.json()) as ContentResponse;
}

describe('GET /api/content', () => {
	it('returns the list of publications', async () => {
		await seedPublication('pub-list-a');
		await seedPublication('pub-list-b');

		const body = await fetchContent();

		const slugs = body.publications.map((publication) => publication.slug);
		expect(slugs).toContain('pub-list-a');
		expect(slugs).toContain('pub-list-b');
		for (const publication of body.publications.filter((publication) =>
			['pub-list-a', 'pub-list-b'].includes(publication.slug)
		)) {
			expect(Object.keys(publication).sort()).toEqual([
				'accent',
				'description',
				'id',
				'name',
				'slug',
			]);
		}
	});

	it('returns published posts in the content schema shape', async () => {
		await seedPublication('pub-shape');
		await db
			.prepare(
				'INSERT INTO categories (id, publication_id, name, slug) VALUES (?, ?, ?, ?)'
			)
			.bind('c-pub-shape-endings', 'pub-shape', 'Endings', 'endings')
			.run();
		await seedPost({
			publication: 'pub-shape',
			slug: 'hello-world',
			status: 'published',
			publishedAt: new Date('2026-01-01T00:00:00Z').toISOString(),
			categoryId: 'c-pub-shape-endings',
			bloggerPostId: 'blog-123',
			canonicalUrl: 'https://example.com/hello-world.html',
			tagSlugs: ['poetry', 'endings'],
		});

		const body = await fetchContent();

		const posts = body.posts.filter((post) => post.publication === 'pub-shape');
		expect(posts).toHaveLength(1);
		expect(posts[0]).toMatchObject({ slug: 'hello-world' });
		const post = contentPostSchema.parse(posts[0]);
		expect(post.title).toBe('Title hello-world');
		expect(post.excerpt).toBe('Excerpt hello-world');
		expect(post.publication).toBe('pub-shape');
		expect(post.category).toBe('Endings');
		expect(post.tags).toEqual(['Tag poetry', 'Tag endings']);
		expect(post.pubDate.toISOString()).toBe(new Date('2026-01-01T00:00:00Z').toISOString());
		expect(post.updatedDate?.toISOString()).toBe(new Date('2026-01-01T00:00:00Z').toISOString());
		expect(post.status).toBe('published');
		expect(post.content).toBe('<p>body</p>');
		expect(post.bloggerPostId).toBe('blog-123');
		expect(post.bloggerUrl).toBe('https://example.com/hello-world.html');
	});

	it('excludes drafts and scheduled-future posts', async () => {
		await seedPublication('pub-filter');
		await seedPost({
			publication: 'pub-filter',
			slug: 'live',
			status: 'published',
			publishedAt: new Date('2026-01-01T00:00:00Z').toISOString(),
		});
		await seedPost({
			publication: 'pub-filter',
			slug: 'draft',
			status: 'draft',
			publishedAt: new Date('2026-01-01T00:00:00Z').toISOString(),
		});
		await seedPost({
			publication: 'pub-filter',
			slug: 'future',
			status: 'published',
			publishedAt: new Date('2099-01-01T00:00:00Z').toISOString(),
		});

		const body = await fetchContent();

		const posts = body.posts.filter((post) => post.publication === 'pub-filter');
		expect(posts).toHaveLength(1);
		const post = contentPostSchema.parse(posts[0]);
		expect(post.title).toBe('Title live');
	});

	it('includes the per-publication accent theme on publication feeds', async () => {
		await seedPublication('pub-accent', 'pub-accent', 'rose');

		const body = await fetchContent();

		expect(
			body.publications.find((publication) => publication.slug === 'pub-accent')
		).toMatchObject({ accent: 'rose' });
	});

	it('returns categories and tags for the CMS', async () => {
		await seedPublication('pub-cms');
		await db
			.prepare(
				'INSERT INTO categories (id, publication_id, name, slug) VALUES (?, ?, ?, ?)'
			)
			.bind('c-pub-cms-endings', 'pub-cms', 'Endings', 'endings')
			.run();
		await seedPost({
			publication: 'pub-cms',
			slug: 'tagged',
			status: 'published',
			publishedAt: new Date('2026-01-01T00:00:00Z').toISOString(),
			tagSlugs: ['poetry'],
		});

		const body = await fetchContent();

		expect(
			body.categories.filter((category) => category.publication_id === 'pub-cms')
		).toEqual([
			{ id: 'c-pub-cms-endings', publication_id: 'pub-cms', name: 'Endings', slug: 'endings' },
		]);
		expect(body.tags.filter((tag) => tag.slug === 'poetry')).toEqual([
			{ id: 't-poetry', name: 'Tag poetry', slug: 'poetry' },
		]);
	});
});

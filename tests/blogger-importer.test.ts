import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { importPosts } from '../src/lib/blogger/importer';
import { readExistingPosts, writePost } from '../src/lib/blogger/storage';
import type { BloggerPostDto, PostRecord } from '../src/lib/blogger/types';

const temps: string[] = [];

async function tempDir(): Promise<string> {
	const dir = await mkdtemp(path.join(tmpdir(), 'blogger-test-'));
	temps.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(temps.map((dir) => rm(dir, { recursive: true, force: true })));
	temps.length = 0;
});

const record = (overrides: Partial<PostRecord> = {}): PostRecord => ({
	title: 'Hello',
	excerpt: 'Excerpt',
	publication: 'the-sore-transition',
	tags: ['Essays', 'change'],
	pubDate: '2024-03-08T09:00:00.000Z',
	status: 'published',
	content: '<p>Hello</p>',
	bloggerPostId: '123',
	bloggerBlogId: 'blog-id',
	bloggerUrl: 'https://example.blogspot.com/2024/03/my-post.html',
	...overrides,
});

describe('blogger storage', () => {
	it('writes and reads back a post record', async () => {
		const dir = await tempDir();
		const filePath = await writePost(dir, 'the-sore-transition', 'my-post', record());

		const raw = JSON.parse(await readFile(filePath, 'utf-8')) as PostRecord;
		expect(raw.title).toBe('Hello');
		expect(raw.publication).toBe('the-sore-transition');

		const existing = await readExistingPosts(dir);
		expect(existing.byBloggerPostId.get('123')).toBe(filePath);
		expect(existing.byPublicationPostId.get('the-sore-transition:123')).toBe(filePath);
		expect(existing.byBloggerIdentity.get('blog-id:123')).toBe(filePath);
		expect(existing.byFile.has(filePath)).toBe(true);
	});

	it('indexes records by blogger post id for dedupe', async () => {
		const dir = await tempDir();
		await writePost(dir, 'a', 'one', record({ bloggerPostId: '1' }));
		await writePost(dir, 'a', 'two', record({ bloggerPostId: '2', title: 'Two' }));

		const existing = await readExistingPosts(dir);
		expect(existing.byBloggerPostId.size).toBe(2);
		expect(existing.byBloggerPostId.get('1')).toBeTruthy();
	});

	it('handles an empty or missing directory', async () => {
		const dir = await tempDir();
		const existing = await readExistingPosts(path.join(dir, 'nope'));
		expect(existing.byBloggerPostId.size).toBe(0);
		expect(existing.byFile.size).toBe(0);
	});
});

describe('blogger importer', () => {
	const dto = (overrides: Partial<BloggerPostDto> = {}): BloggerPostDto => ({
		kind: 'blogger#post',
		id: '123',
		blog: { id: 'blog-id' },
		published: '2024-03-08T09:00:00Z',
		updated: '2024-03-09T10:00:00Z',
		url: 'https://example.blogspot.com/2024/03/my-post.html',
		title: 'My Post',
		content: '<p>Hello</p><script>alert(1)</script>',
		status: 'LIVE',
		...overrides,
	});

	it('imports posts and sanitizes content', async () => {
		const dir = await tempDir();
		const posts = [dto({ id: '1' }), dto({ id: '2', title: 'Two', url: 'https://example.blogspot.com/2024/03/two.html' })];
		const client = { fetchAllPosts: async function* () { yield* posts; } } as never;

		const report = await importPosts({
			client,
			outputDir: dir,
			publicationSlug: 'the-sore-transition',
			blogId: 'blog-id',
		});

		expect(report.found).toBe(2);
		expect(report.imported).toBe(2);
		expect(report.failed).toHaveLength(0);

		const files = await readdir(dir);
		expect(files).toContain('the-sore-transition-my-post.json');
		expect(files).toContain('the-sore-transition-two.json');

		const raw = await readFile(path.join(dir, 'the-sore-transition-my-post.json'), 'utf-8');
		const parsed = JSON.parse(raw) as PostRecord;
		expect(parsed.content).not.toContain('<script');
	});

	it('skips already imported posts unless update is set', async () => {
		const dir = await tempDir();
		await writePost(dir, 'the-sore-transition', 'my-post', record({ bloggerPostId: '123' }));

		const posts = [dto({ id: '123' })];
		const client = { fetchAllPosts: async function* () { yield* posts; } } as never;

		const report = await importPosts({
			client,
			outputDir: dir,
			publicationSlug: 'the-sore-transition',
			blogId: 'blog-id',
		});

		expect(report.skipped).toBe(1);
		expect(report.imported).toBe(0);

		const updated = await importPosts({
			client,
			outputDir: dir,
			publicationSlug: 'the-sore-transition',
			blogId: 'blog-id',
			update: true,
		});
		expect(updated.imported).toBe(1);
	});

	it('does not treat the same post id in another Blogger blog as a duplicate', async () => {
		const dir = await tempDir();
		await writePost(dir, 'the-sore-transition', 'my-post', record());

		const client = {
			fetchAllPosts: async function* () {
				yield dto({ id: '123', blog: { id: 'other-blog' } });
			},
		} as never;

		const report = await importPosts({
			client,
			outputDir: dir,
			publicationSlug: 'the-rebellious-flame',
			blogId: 'other-blog',
		});

		expect(report.imported).toBe(1);
		expect(report.skipped).toBe(0);
	});

	it('updates an existing post in place without creating a duplicate file', async () => {
		const dir = await tempDir();
		await writePost(dir, 'the-sore-transition', 'my-post', record({ bloggerPostId: '123' }));

		const posts = [dto({ id: '123' })];
		const client = { fetchAllPosts: async function* () { yield* posts; } } as never;

		await importPosts({
			client,
			outputDir: dir,
			publicationSlug: 'the-sore-transition',
			blogId: 'blog-id',
			update: true,
		});

		const files = await readdir(dir);
		expect(files).toEqual(['the-sore-transition-my-post.json']);
	});

	it('records failed posts without aborting the import', async () => {
		const dir = await tempDir();
		const client = {
			fetchAllPosts: async function* () {
				yield dto({ id: 'good' });
				yield dto({ id: 'bad', status: 'DRAFT' });
			},
		} as never;

		const report = await importPosts({
			client,
			outputDir: dir,
			publicationSlug: 'the-sore-transition',
			blogId: 'blog-id',
		});

		expect(report.imported).toBe(1);
		expect(report.failed).toHaveLength(1);
		expect(report.failed[0].bloggerPostId).toBe('bad');
	});

	it('respects a limit on the number of posts processed', async () => {
		const dir = await tempDir();
		const posts = [dto({ id: '1' }), dto({ id: '2' })];
		const client = { fetchAllPosts: async function* () { yield* posts; } } as never;

		const report = await importPosts({
			client,
			outputDir: dir,
			publicationSlug: 'the-sore-transition',
			blogId: 'blog-id',
			limit: 1,
		});
		expect(report.found).toBe(1);
	});
});

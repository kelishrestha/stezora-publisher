import { describe, expect, it, vi } from 'vitest';
import type { PostRecord } from '../src/lib/blogger/types';
import { buildBackfillSql } from '../scripts/db/import-json-to-d1';

function record(overrides: Partial<PostRecord>): PostRecord {
	return {
		title: 'Hello World',
		excerpt: 'An excerpt.',
		publication: 'the-sore-transition',
		tags: ['Reflection', 'Change'],
		pubDate: '2024-01-15T10:00:00.000Z',
		status: 'published',
		content: '<p>Body text.</p>',
		bloggerPostId: '',
		bloggerUrl: '',
		...overrides,
	};
}

const NOW = '2024-02-01T00:00:00.000Z';

describe('buildBackfillSql', () => {
	it('emits idempotent upserts for a non-Blogger post', () => {
		const sql = buildBackfillSql(
			[{ filePath: 'the-sore-transition-hello-world.json', record: record({}) }],
			{ now: NOW }
		);

		expect(sql).not.toContain('INSERT INTO categories');
		expect(sql).toContain('INSERT INTO posts');
		expect(sql).toContain("INSERT INTO posts (id, publication_id, title");
		expect(sql).toContain('ON CONFLICT (publication_id, slug) DO UPDATE SET');
		expect(sql).toContain('INSERT INTO tags');
		expect(sql).toContain('ON CONFLICT (publication_id, slug) DO NOTHING;');
		expect(sql).toContain('INSERT INTO post_tags');
		expect(sql).toContain('ON CONFLICT (post_id, tag_id) DO NOTHING;');
	});

	it('uses the Blogger conflict target when Blogger ids are present', () => {
		const sql = buildBackfillSql(
			[
				{
					filePath: 'src/content/posts/the-rebellious-flame-some-post.json',
					record: record({
						publication: 'the-rebellious-flame',
						bloggerPostId: '987654321',
						bloggerUrl: 'https://therebelliousflame.blogspot.com/2024/01/some-post.html',
					}),
				},
			],
			{ now: NOW, blogIdsByPublication: new Map([['the-rebellious-flame', '424242']]) }
		);

		expect(sql).toContain('ON CONFLICT (blogger_blog_id, blogger_post_id) DO UPDATE SET');
		expect(sql).not.toContain('ON CONFLICT (publication_id, slug) DO UPDATE');
		expect(sql).toContain("'987654321'");
		expect(sql).toContain("'424242'");
	});

	it('keeps NULL Blogger ids when the blog id is not configured', () => {
		const sql = buildBackfillSql(
			[
				{
					filePath: 'src/content/posts/the-sore-transition-blog-post.json',
					record: record({ bloggerPostId: '555', bloggerUrl: 'https://x.blogspot.com/p.html' }),
				},
			],
			{ now: NOW }
		);

		expect(sql).toContain('ON CONFLICT (publication_id, slug) DO UPDATE SET');
		expect(sql).toContain(', NULL, NULL, ');
		expect(sql).not.toContain("'555'");
	});

	it('upgrades a previously NULL-Blogger post to Blogger ids when the blog id is configured later', () => {
		const sql = buildBackfillSql(
			[
				{
					filePath: 'src/content/posts/the-sore-transition-some-post.json',
					record: record({ bloggerPostId: '555', bloggerUrl: 'https://x.blogspot.com/p.html' }),
				},
			],
			{ now: NOW, blogIdsByPublication: new Map([['the-sore-transition', '424242']]) }
		);

		expect(sql).toContain("UPDATE posts SET blogger_blog_id = '424242'");
		expect(sql).toContain("blogger_post_id = '555'");
		expect(sql).toContain(
			"WHERE publication_id = 'the-sore-transition' AND slug = 'some-post' AND blogger_post_id IS NULL;"
		);
		expect(sql).toContain('ON CONFLICT (blogger_blog_id, blogger_post_id) DO UPDATE SET');
	});

	it('escapes single quotes in string values', () => {
		const sql = buildBackfillSql(
			[
				{
					filePath: 'the-sore-transition-its-a-post.json',
					record: record({
						title: "It's a test",
						tags: ["two's", 'other'],
						content: "<p>Can't stop.</p>",
					}),
				},
			],
			{ now: NOW }
		);

		expect(sql).toContain("'It''s a test'");
		expect(sql).toContain("'two''s'");
		expect(sql).toContain("<p>Can''t stop.</p>");
	});

	it('is deterministic across runs', () => {
		const input = [
			{ filePath: 'src/content/posts/the-sore-transition-a.json', record: record({ title: 'A' }) },
			{ filePath: 'src/content/posts/the-sore-transition-b.json', record: record({ title: 'B' }) },
		];
		const first = buildBackfillSql(input, { now: NOW });
		const second = buildBackfillSql(input, { now: NOW });
		expect(second).toBe(first);
	});

	it('sanitizes post content before writing it to D1', () => {
		const sql = buildBackfillSql(
			[
				{
					filePath: 'src/content/posts/the-sore-transition-xss.json',
					record: record({
						content: '<p>hello</p><script>alert(1)</script><img src="javascript:alert(2)" onerror="alert(3)">',
					}),
				},
			],
			{ now: NOW }
		);

		expect(sql).not.toContain('<script>');
		expect(sql).not.toContain('onerror');
		expect(sql).toContain('<p>hello</p>');
	});

	it('skips posts whose publication is unknown', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const sql = buildBackfillSql(
			[
				{
					filePath: 'src/content/posts/not-a-publication-post.json',
					record: record({ publication: 'not-a-publication' }),
				},
			],
			{ now: NOW }
		);

		expect(sql).not.toContain('INSERT INTO posts');
		expect(warn).toHaveBeenCalledOnce();
		warn.mockRestore();
	});
});

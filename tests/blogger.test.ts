import { describe, expect, it } from 'vitest';
import { sanitizeBloggerHtml, extractImageUrls, normalizeUrl, slugFromUrl } from '../src/lib/blogger/html';
import { makeUniqueSlug, mapPost } from '../src/lib/blogger/mapper';
import { postFilename } from '../src/lib/blogger/storage';
import type { BloggerPostDto } from '../src/lib/blogger/types';

const dto = (overrides: Partial<BloggerPostDto> = {}): BloggerPostDto => ({
	kind: 'blogger#post',
	id: '123',
	blog: { id: 'blog-id' },
	published: '2024-03-08T09:00:00Z',
	updated: '2024-03-09T10:00:00Z',
	url: 'https://example.blogspot.com/2024/03/my-post.html',
	title: 'My Post',
	content: '<p>Hello</p>',
	...overrides,
});

describe('blogger mapper', () => {
	it('maps a live post into an internal record', () => {
		const { record, baseSlug } = mapPost(
			dto({ labels: ['Essays', 'change', 'hope'], status: 'LIVE' }),
			{ publicationSlug: 'the-sore-transition' }
		);

		expect(record.title).toBe('My Post');
		expect(record.publication).toBe('the-sore-transition');
		expect(record.category).toBe('Essays');
		expect(record.tags).toEqual(['change', 'hope']);
		expect(record.status).toBe('published');
		expect(record.bloggerPostId).toBe('123');
		expect(record.pubDate).toBe('2024-03-08T09:00:00.000Z');
		expect(record.updatedDate).toBe('2024-03-09T10:00:00.000Z');
		expect(baseSlug).toBe('my-post');
	});

	it('uses a fallback category and tag list when labels are missing', () => {
		const { record } = mapPost(dto({ labels: undefined }), { publicationSlug: 'the-sore-transition' });
		expect(record.category).toBe('Uncategorized');
		expect(record.tags).toEqual([]);
	});

	it('treats drafts as draft status and rejects them when drafts are excluded', () => {
		const mapped = mapPost(dto({ status: 'DRAFT' }), {
			publicationSlug: 'the-sore-transition',
			includeDrafts: true,
		});
		expect(mapped.record.status).toBe('draft');

		expect(() =>
			mapPost(dto({ status: 'DRAFT' }), { publicationSlug: 'the-sore-transition' })
		).toThrow(/drafts are not included/);
	});

	it('builds an excerpt from plain text and caps its length', () => {
		const longContent = `<p>${'word '.repeat(200)}</p>`;
		const { record } = mapPost(dto({ content: longContent }), { publicationSlug: 'a' });
		expect(record.excerpt.length).toBeLessThanOrEqual(280);
		expect(record.excerpt).not.toMatch(/</);
	});
});

describe('blogger html sanitization', () => {
	it('strips scripts and inline event handlers', () => {
		const html = '<p>Hello</p><script>alert(1)</script><img onerror="alert(2)" src="x.png">';
		const cleaned = sanitizeBloggerHtml(html);
		expect(cleaned).not.toContain('<script');
		expect(cleaned).not.toContain('onerror');
	});

	it('rejects javascript: and data: URLs', () => {
		const html = '<a href="javascript:alert(1)">bad</a><img src="data:text/html;base64,x">';
		const cleaned = sanitizeBloggerHtml(html);
		expect(cleaned).not.toContain('javascript:');
		expect(cleaned).not.toContain('data:');
	});

	it('adds rel noopener noreferrer to links', () => {
		const cleaned = sanitizeBloggerHtml('<a href="https://example.com">link</a>');
		expect(cleaned).toContain('rel="noopener noreferrer"');
	});

	it('normalizes protocol-relative URLs when asked', () => {
		const html = '<img src="//example.com/x.png">';
		const cleaned = sanitizeBloggerHtml(html, { normalizeProtocolRelativeUrls: true });
		expect(cleaned).toContain('src="https://example.com/x.png"');
	});

	it('preserves div-wrapped lines so line breaks survive import', () => {
		const html = '<div>Staring at the blue sky, an evening hour</div><div>Chimed in solo side, not breathing a soul</div>';
		const cleaned = sanitizeBloggerHtml(html);
		expect(cleaned).toBe(
			'<div>Staring at the blue sky, an evening hour</div><div>Chimed in solo side, not breathing a soul</div>'
		);
	});

	it('extracts image URLs from HTML', () => {
		const html = '<img src="https://example.com/a.png"><img src="//example.com/b.jpg">';
		expect(extractImageUrls(html)).toEqual(['https://example.com/a.png', '//example.com/b.jpg']);
	});
});

describe('blogger url helpers', () => {
	it('normalizes protocol-relative and root-relative URLs', () => {
		expect(normalizeUrl('//example.com/x')).toBe('https://example.com/x');
		expect(normalizeUrl('/example.com/x')).toBe('https://example.com/x');
		expect(normalizeUrl('https://example.com/x')).toBe('https://example.com/x');
		expect(normalizeUrl('')).toBe('');
	});

	it('derives a slug from a post URL path', () => {
		expect(slugFromUrl('https://example.blogspot.com/2024/03/my-post.html')).toBe('my-post');
		expect(slugFromUrl('https://example.blogspot.com/2024/03/a-b-c.html')).toBe('a-b-c');
	});
});

describe('blogger slugs and filenames', () => {
	it('suffixes a slug to make it unique', () => {
		const used = new Set(['post']);
		expect(makeUniqueSlug('post', used)).toBe('post-2');
		used.add('post-2');
		expect(makeUniqueSlug('post', used)).toBe('post-3');
	});

	it('builds the post filename from publication and slug', () => {
		expect(postFilename('the-sore-transition', 'my-post')).toBe('the-sore-transition-my-post.json');
	});
});

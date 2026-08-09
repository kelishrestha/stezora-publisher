import { describe, expect, it } from 'vitest';
import {
	PUBLICATIONS_PATH,
	categoryPath,
	getPublication,
	getPublications,
	postPath,
	publicationPath,
	slugify,
	sortByDateDesc,
	tagPath,
} from '../src/lib/publications';

describe('publication model', () => {
	it('exposes three publications with unique slugs', () => {
		const publications = getPublications();
		expect(publications).toHaveLength(3);
		const slugs = new Set(publications.map((p) => p.slug));
		expect(slugs.size).toBe(publications.length);
	});

	it('defines the expected first-class publications', () => {
		const slugs = getPublications().map((p) => p.slug).sort();
		expect(slugs).toEqual(['my-soulful-incantations', 'the-rebellious-flame', 'the-sore-transition']);
	});

	it('gives every publication a name, slug and description', () => {
		for (const publication of getPublications()) {
			expect(publication.id).toBe(publication.slug);
			expect(publication.name.length).toBeGreaterThan(0);
			expect(publication.slug).toMatch(/^[a-z0-9-]+$/);
			expect(publication.description.length).toBeGreaterThan(0);
		}
	});

	it('looks up a publication by slug', () => {
		expect(getPublication('the-rebellious-flame')?.name).toBe('The Rebellious Flame');
		expect(getPublication('nope')).toBeUndefined();
	});
});

describe('publication path helpers', () => {
	it('builds the publications hub path', () => {
		expect(PUBLICATIONS_PATH).toBe('/publications');
		expect(publicationPath('a')).toBe('/publications/a');
	});

	it('builds post, category and tag paths', () => {
		expect(postPath('a', 'b')).toBe('/publications/a/posts/b');
		expect(categoryPath('a', 'b')).toBe('/publications/a/categories/b');
		expect(tagPath('a', 'b')).toBe('/publications/a/tags/b');
	});
});

describe('slugify', () => {
	it('lowercases and trims', () => {
		expect(slugify('  Hello World  ')).toBe('hello-world');
	});

	it('replaces spaces and underscores with dashes', () => {
		expect(slugify('some_thing else')).toBe('some-thing-else');
	});

	it('collapses repeated dashes', () => {
		expect(slugify('a--b   c')).toBe('a-b-c');
	});

	it('strips characters that are not letters, numbers, spaces or dashes', () => {
		expect(slugify('On: The Art of Code')).toBe('on-the-art-of-code');
	});

	it('handles empty strings', () => {
		expect(slugify('')).toBe('');
		expect(slugify('  ---  ')).toBe('');
	});
});

describe('sortByDateDesc', () => {
	it('sorts newest first without mutating the input', () => {
		const input = [new Date('2024-01-01'), new Date('2024-03-01'), new Date('2024-02-01')].map((d) => ({
			pubDate: d,
		}));
		const output = sortByDateDesc(input, (item) => item.pubDate);
		expect(output.map((x) => x.pubDate.toISOString())).toEqual([
			'2024-03-01T00:00:00.000Z',
			'2024-02-01T00:00:00.000Z',
			'2024-01-01T00:00:00.000Z',
		]);
		expect(input).toHaveLength(3);
	});
});

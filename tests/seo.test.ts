import { describe, expect, it } from 'vitest';
import { SITE } from '../src/lib/seo/config';
import { absoluteUrl, canonicalUrl, formatDate } from '../src/lib/seo/seo';

describe('seo helpers', () => {
	it('turns a relative path into an absolute URL', () => {
		expect(absoluteUrl('/about')).toBe(`${SITE.url}/about`);
		expect(absoluteUrl('about')).toBe(`${SITE.url}/about`);
		expect(absoluteUrl('https://example.com/x')).toBe('https://example.com/x');
	});

	it('keeps canonical URLs free of query strings and hashes', () => {
		expect(canonicalUrl('/about?utm_source=x#intro')).toBe(`${SITE.url}/about`);
		expect(canonicalUrl('/')).toBe(`${SITE.url}/`);
	});

	it('formats dates as ISO strings', () => {
		expect(formatDate(new Date('2024-01-02T03:04:05Z'))).toBe('2024-01-02T03:04:05.000Z');
		expect(formatDate('2024-01-02')).toBe('2024-01-02T00:00:00.000Z');
	});

	it('returns an empty string for invalid dates', () => {
		expect(formatDate('not-a-date')).toBe('');
	});
});

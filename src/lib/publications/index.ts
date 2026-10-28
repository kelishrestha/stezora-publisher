import { publications } from './data';
import type { Publication } from './types';

export { deriveExcerpt, postExcerpt } from './excerpt';

export const PUBLICATIONS_PATH = '/poetry-collections';

/** Posts per page on the public publication listing. */
export const POSTS_PAGE_SIZE = 6;

export function getPublications(): Publication[] {
	return publications;
}

export function getPublication(slug: string): Publication | undefined {
	return publications.find((publication) => publication.slug === slug);
}

export function slugify(value: string): string {
	const trimmed = value.toLowerCase().trim();
	if (!trimmed) {
		return '';
	}
	const slug = trimmed
		.replace(/[^a-z0-9\s_-]/g, '')
		.replace(/[\s_]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
	if (slug) {
		return slug;
	}
	return `term-${stableHash(trimmed)}`;
}

function stableHash(value: string): string {
	let hash = 2166136261;
	for (let i = 0; i < value.length; i += 1) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
}

export function publicationPath(slug: string): string {
	return `${PUBLICATIONS_PATH}/${slug}`;
}

export function publicationRssPath(slug: string): string {
	return `${PUBLICATIONS_PATH}/${slug}/rss.xml`;
}

export function postPath(publicationSlug: string, postSlug: string): string {
	return `${PUBLICATIONS_PATH}/${publicationSlug}/posts/${postSlug}`;
}

export function tagPath(publicationSlug: string, tag: string): string {
	return `${PUBLICATIONS_PATH}/${publicationSlug}/tags/${tag}`;
}

export function sortByDateDesc<T>(items: T[], getDate: (item: T) => Date): T[] {
	return [...items].sort((a, b) => getDate(b).getTime() - getDate(a).getTime());
}

import { publications } from './data';
import type { Publication } from './types';

export const PUBLICATIONS_PATH = '/publications';

export function getPublications(): Publication[] {
	return publications;
}

export function getPublication(slug: string): Publication | undefined {
	return publications.find((publication) => publication.slug === slug);
}

export function slugify(value: string): string {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9\s_-]/g, '')
		.replace(/[\s_]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
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

export function categoryPath(publicationSlug: string, category: string): string {
	return `${PUBLICATIONS_PATH}/${publicationSlug}/categories/${category}`;
}

export function tagPath(publicationSlug: string, tag: string): string {
	return `${PUBLICATIONS_PATH}/${publicationSlug}/tags/${tag}`;
}

export function sortByDateDesc<T>(items: T[], getDate: (item: T) => Date): T[] {
	return [...items].sort((a, b) => getDate(b).getTime() - getDate(a).getTime());
}

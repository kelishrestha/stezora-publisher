import { SITE } from './config';
import { absoluteUrl, canonicalUrl, formatDate } from './seo';

export type JsonLd = Record<string, unknown>;

export interface PageMeta {
	title: string;
	description: string;
	path?: string;
	image?: string;
	publishedAt?: Date | string;
	updatedAt?: Date | string;
}

function imageUrl(image?: string): string | undefined {
	return image ? absoluteUrl(image) : undefined;
}

export function websiteJsonLd(): JsonLd {
	return {
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		name: SITE.name,
		url: SITE.url,
		description: SITE.description,
	};
}

export function webPageJsonLd(meta: PageMeta): JsonLd {
	return {
		'@context': 'https://schema.org',
		'@type': 'WebPage',
		headline: meta.title,
		description: meta.description,
		url: canonicalUrl(meta.path),
		image: imageUrl(meta.image),
		isPartOf: { '@type': 'WebSite', name: SITE.name, url: SITE.url },
	};
}

export function articleJsonLd(meta: PageMeta): JsonLd {
	const published = meta.publishedAt ? formatDate(meta.publishedAt) : undefined;
	const updated = meta.updatedAt ? formatDate(meta.updatedAt) : published;
	return {
		'@context': 'https://schema.org',
		'@type': 'Article',
		headline: meta.title,
		description: meta.description,
		url: canonicalUrl(meta.path),
		image: imageUrl(meta.image),
		datePublished: published,
		dateModified: updated,
		author: { '@type': 'Person', name: SITE.author },
		publisher: { '@type': 'Organization', name: SITE.name },
		mainEntityOfPage: canonicalUrl(meta.path),
	};
}

export interface BreadcrumbItem {
	name: string;
	href?: string;
}

export function breadcrumbJsonLd(items: BreadcrumbItem[]): JsonLd {
	const itemList = items.map((item, index) => ({
		'@type': 'ListItem',
		position: index + 1,
		name: item.name,
		...(item.href ? { item: canonicalUrl(item.href) } : {}),
	}));
	return {
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: itemList,
	};
}

export function renderJsonLd(...nodes: JsonLd[]): JsonLd[] {
	return nodes;
}

export function serializeJsonLd(node: JsonLd): string {
	return JSON.stringify(node).replace(/</g, '\\u003c');
}

import { sanitizeContentHtml } from './sanitize';
import { slugify } from '../publications';

export interface SanitizeOptions {
	normalizeProtocolRelativeUrls?: boolean;
}

export function sanitizeBloggerHtml(html: string, options: SanitizeOptions = {}): string {
	const cleaned = sanitizeContentHtml(html);
	if (!options.normalizeProtocolRelativeUrls) {
		return cleaned;
	}
	return cleaned.replace(/(src|href)="\/\//gi, '$1="https://');
}

export function extractImageUrls(html: string): string[] {
	const urls: string[] = [];
	const sourceRe = /\b(?:src|href)="([^"]+)"/gi;
	for (const match of html.matchAll(sourceRe)) {
		const url = match[1];
		if (isImageUrl(url)) {
			urls.push(url);
		}
	}
	return urls;
}

function isImageUrl(url: string): boolean {
	const normalized = normalizeUrl(url);
	if (!normalized) {
		return false;
	}
	const path = new URL(normalized).pathname.toLowerCase();
	return /\.(jpe?g|png|gif|webp|avif|svg|bmp)$/.test(path);
}

export function normalizeUrl(url: string): string {
	if (!url) {
		return '';
	}
	if (url.startsWith('//')) {
		return `https:${url}`;
	}
	if (url.startsWith('/')) {
		return `https://${url.slice(1)}`;
	}
	return url;
}

export function slugFromUrl(url: string): string {
	const normalized = normalizeUrl(url);
	if (!normalized) {
		return '';
	}
	const pathname = new URL(normalized).pathname;
	const segments = pathname.split('/').filter(Boolean);
	const last = (segments.at(-1) ?? '').replace(/\.html?$/, '');
	const slug = slugify(last);
	return slug;
}

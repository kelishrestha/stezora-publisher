import { SITE } from './config';

export function absoluteUrl(path: string): string {
	if (path.startsWith('http://') || path.startsWith('https://')) {
		return path;
	}
	const base = SITE.url.replace(/\/+$/, '');
	const joined = path.startsWith('/') ? path : `/${path}`;
	return `${base}${joined}`;
}

export function canonicalUrl(path = '/'): string {
	return absoluteUrl(path).split('#')[0].split('?')[0];
}

export function formatDate(date: Date | string): string {
	const d = typeof date === 'string' ? new Date(date) : date;
	if (Number.isNaN(d.getTime())) {
		return '';
	}
	return d.toISOString();
}

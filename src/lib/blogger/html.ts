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

/**
 * Blogger wraps every image in boilerplate: an anchor to the full-size file
 * around the sized <img>, usually inside a separator div. These two
 * transforms are inverses so content can be compiled from and back to
 * Blogger's format: unwrap on import (clean <img> for the markdown
 * pipeline, images registered as post media), wrap when mirroring a post
 * back to Blogger.
 */
const BLOGGER_LINKED_IMAGE = /<a\b[^>]*href="([^"]+)"[^>]*>\s*(<img\b[^>]*\/?>)\s*<\/a>/gi;
const BLOGGER_SEPARATOR_IMAGE =
	/<div\b[^>]*class="separator"[^>]*>\s*<a\b[^>]*href="([^"]+)"[^>]*>\s*(<img\b[^>]*\/?>)\s*<\/a>\s*<\/div>/gi;

function imgSrc(imgTag: string): string {
	return /\bsrc="([^"]+)"/i.exec(imgTag)?.[1] ?? '';
}

function isBloggerImageUrl(url: string): boolean {
	try {
		const host = new URL(normalizeUrl(url)).hostname;
		return host.endsWith('googleusercontent.com') || host.endsWith('bp.blogspot.com');
	} catch {
		return false;
	}
}

export function unwrapBloggerImages(html: string): string {
	const replaceLinked = (full: string, href: string, imgTag: string): string => {
		const src = imgSrc(imgTag);
		if (!isBloggerImageUrl(href) || !isBloggerImageUrl(src)) {
			return full;
		}
		// Prefer the anchor target: it is the full-size variant.
		return `<img src="${href}" />`;
	};
	// Consume the separator wrapper first so repeated wrap/unwrap cycles do
	// not accumulate nested separator divs, then handle bare linked images.
	return html.replace(BLOGGER_SEPARATOR_IMAGE, replaceLinked).replace(BLOGGER_LINKED_IMAGE, replaceLinked);
}

export function wrapImagesForBlogger(html: string): string {
	return html.replace(/<img\b[^>]*\/?>/gi, (imgTag, offset: number) => {
		const src = imgSrc(imgTag);
		if (!src) {
			return imgTag;
		}
		// Leave images alone when they are already wrapped in an anchor.
		const before = html.slice(0, offset);
		const lastAnchorOpen = before.lastIndexOf('<a');
		const lastAnchorClose = before.lastIndexOf('</a>');
		if (lastAnchorOpen > lastAnchorClose) {
			return imgTag;
		}
		return (
			'<div class="separator" style="clear: both; text-align: center;">' +
			`<a href="${src}" style="margin-left: 1em; margin-right: 1em;">` +
			`<img border="0" src="${src}" width="400" />` +
			'</a></div>'
		);
	});
}

/**
 * Removes every <img> from content HTML, then collapses the wrapper
 * elements Blogger leaves behind (empty divs, anchors, spacer divs holding a
 * lone <br>). Imported images live as post media and render as the featured
 * image above the content, so the content itself stays image-free.
 */
export function stripImages(html: string): string {
	let output = html.replace(/<img\b[^>]*\/?>/gi, '');
	let previous;
	do {
		previous = output;
		// Only drop wrappers emptied by the image removal. Blogger's
		// <div><br/></div> spacers carry paragraph breaks and must survive,
		// except at the very start where they only padded the lead image.
		output = output.replace(/<(div|p|a|span)\b[^>]*>\s*<\/\1>/gi, '');
	} while (output !== previous);
	return output.replace(/^(?:\s*<div\b[^>]*>\s*(?:<br\s*\/?>\s*)*<\/div>)+/i, '').trim();
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

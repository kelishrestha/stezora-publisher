import { slugify } from '../publications';
import { normalizeUrl, slugFromUrl } from './html';
import type { BloggerPostDto, PostRecord, PostStatus } from './types';

export interface MapPostOptions {
	publicationSlug: string;
	blogId?: string;
	includeDrafts?: boolean;
}

export interface MappedPost {
	record: PostRecord;
	baseSlug: string;
}

export function mapPost(dto: BloggerPostDto, options: MapPostOptions): MappedPost {
	// Drafts can arrive without a `published` date; fall back to `updated` so
	// mapping never produces an Invalid Date.
	const updatedDate = new Date(dto.updated).toISOString();
	const pubDate = new Date(dto.published ?? dto.updated).toISOString();

	const tags = dto.labels ?? [];

	const status: PostStatus = dto.status === 'DRAFT' ? 'draft' : 'published';
	if (status === 'draft' && !options.includeDrafts) {
		throw new Error(`Post "${dto.title}" is a draft and drafts are not included`);
	}

	const bloggerUrl = normalizeUrl(dto.url);
	const baseSlug = slugFromUrl(bloggerUrl) || slugify(dto.title);

	// Blogger has no excerpt field, so the excerpt stays empty: it is a
	// hand-written summary authored in the CMS. Public display derives a
	// teaser from the content when the excerpt is empty
	// (src/lib/publications/excerpt.ts).
	return {
		record: {
			title: dto.title,
			excerpt: '',
			publication: options.publicationSlug,
			tags,
			pubDate,
			updatedDate,
			status,
			content: dto.content,
			bloggerBlogId: options.blogId ?? dto.blog.id,
			bloggerPostId: dto.id,
			bloggerUrl,
		},
		baseSlug,
	};
}

export function makeUniqueSlug(base: string, existing: Set<string>): string {
	if (!existing.has(base)) {
		return base;
	}
	let suffix = 2;
	while (existing.has(`${base}-${suffix}`)) {
		suffix += 1;
	}
	return `${base}-${suffix}`;
}

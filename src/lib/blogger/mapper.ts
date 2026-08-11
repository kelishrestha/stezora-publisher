import { slugify } from '../publications';
import { normalizeUrl, slugFromUrl } from './html';
import type { BloggerPostDto, PostRecord, PostStatus } from './types';

export interface MapPostOptions {
	publicationSlug: string;
	includeDrafts?: boolean;
}

export interface MappedPost {
	record: PostRecord;
	baseSlug: string;
}

export function mapPost(dto: BloggerPostDto, options: MapPostOptions): MappedPost {
	const pubDate = new Date(dto.published).toISOString();
	const updatedDate = new Date(dto.updated).toISOString();

	const category = dto.labels?.[0] ?? 'Uncategorized';
	const tags = (dto.labels ?? []).slice(1);

	const status: PostStatus = dto.status === 'DRAFT' ? 'draft' : 'published';
	if (status === 'draft' && !options.includeDrafts) {
		throw new Error(`Post "${dto.title}" is a draft and drafts are not included`);
	}

	const bloggerUrl = normalizeUrl(dto.url);
	const baseSlug = slugFromUrl(bloggerUrl) || slugify(dto.title);

	const excerpt = dto.content
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 280);

	return {
		record: {
			title: dto.title,
			excerpt,
			publication: options.publicationSlug,
			category,
			tags,
			pubDate,
			updatedDate,
			status,
			content: dto.content,
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

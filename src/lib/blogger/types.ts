export interface BloggerPostDto {
	kind: string;
	id: string;
	blog: { id: string };
	published: string;
	updated: string;
	url: string;
	selfLink?: string;
	title: string;
	content: string;
	labels?: string[];
	author?: {
		id?: string;
		displayName?: string;
		url?: string;
		image?: { url?: string };
	};
	replies?: { totalItems: string; selfLink: string };
	status?: 'LIVE' | 'DRAFT' | 'DELETED';
}

export interface BloggerListResponse {
	kind: string;
	nextPageToken?: string;
	items?: BloggerPostDto[];
}

export interface BloggerClientConfig {
	blogId: string;
	clientId: string;
	clientSecret: string;
	refreshToken: string;
	baseUrl?: string;
	tokenUrl?: string;
	fetchImpl?: typeof fetch;
}

export interface BloggerListOptions {
	pageToken?: string;
	maxResults?: number;
	status?: string;
}

export type PostStatus = 'published' | 'draft';

export interface PostRecord {
	title: string;
	excerpt: string;
	publication: string;
	tags: string[];
	pubDate: string;
	updatedDate?: string;
	status: PostStatus;
	content: string;
	bloggerBlogId?: string;
	bloggerPostId: string;
	bloggerUrl: string;
}

export interface ImportedImage {
	url: string;
}

export interface ImportReport {
	publicationSlug: string;
	blogId: string;
	found: number;
	imported: number;
	skipped: number;
	skippedPosts: Array<{ bloggerPostId: string; title: string; reason: string }>;
	failed: Array<{ bloggerPostId: string; title: string; error: string }>;
	images: ImportedImage[];
}

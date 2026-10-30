export interface BloggerPostDto {
	kind: string;
	id: string;
	blog: { id: string };
	// Drafts can lack a published date; mapping falls back to `updated`.
	published?: string;
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
	/**
	 * Post statuses to include. The Blogger API `status` parameter is a repeated
	 * enum (LIVE, DRAFT, SCHEDULED, SOFT_TRASHED), so each value is sent as its
	 * own `status=` query parameter. Omit to let the API default to LIVE only.
	 */
	statuses?: string[];
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
	seoTitle?: string;
	seoDescription?: string;
	featuredImage?: string;
	bloggerBlogId?: string;
	bloggerPostId: string;
	bloggerUrl: string;
	// Neobook engagement snapshot, carried into the static build for the public
	// per-post stats. Present only when the post is matched on Neobook; counts
	// are emitted only when positive.
	neobookUrl?: string;
	neobookViews?: number;
	neobookLikes?: number;
	neobookComments?: number;
}

export interface ImportedImage {
	url: string;
}

/** Blogger blog-level pageview totals (owner-only; no per-post breakdown). */
export interface BloggerPageviews {
	blogId?: string;
	counts?: Array<{ count: string; timeRange: string }>;
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

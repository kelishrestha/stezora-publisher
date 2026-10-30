import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { createDb, type Db } from './client';
import { bloggerSync, posts, postTags, publications, tags, media } from './schema';
import { mediaUrl } from './media';

export type PostStatus = 'draft' | 'scheduled' | 'published' | 'archived';

export const POST_STATUSES: readonly PostStatus[] = ['draft', 'scheduled', 'published', 'archived'];

export function isPostStatus(value: string): value is PostStatus {
	return (POST_STATUSES as readonly string[]).includes(value);
}

export interface FeaturedImage {
	id: string;
	url: string;
	filename: string;
	mimeType: string;
}

export interface AdminPost {
	id: string;
	publicationId: string;
	publication: string;
	title: string;
	slug: string;
	excerpt: string;
	content: string;
	contentMarkdown: string;
	tags: string[];
	status: PostStatus;
	publishedAt: string | null;
	updatedAt: string | null;
	seoTitle: string | null;
	seoDescription: string | null;
	canonicalUrl: string | null;
	bloggerBlogId: string | null;
	bloggerPostId: string | null;
	neobookUrl: string | null;
	source: string;
	neobookViews: number | null;
	neobookLikes: number | null;
	neobookComments: number | null;
	featuredImageId: string | null;
	featuredImage: FeaturedImage | null;
	createdAt: string;
}

export interface NewPost {
	publicationId: string;
	title: string;
	slug: string;
	excerpt: string;
	content: string;
	contentMarkdown: string;
	seoTitle: string | null;
	seoDescription: string | null;
	status: PostStatus;
	publishedAt: string | null;
	tagNames: string[];
	featuredImageId?: string | null;
	createdAt: string;
}

interface PostRow {
	id: string;
	publication_id: string;
	publication: string;
	title: string;
	slug: string;
	excerpt: string | null;
	content: string;
	content_markdown: string | null;
	status: string;
	published_at: string | null;
	updated_at: string | null;
	seo_title: string | null;
	seo_description: string | null;
	canonical_url: string | null;
	blogger_blog_id: string | null;
	blogger_post_id: string | null;
	neobook_url: string | null;
	source: string;
	neobook_views: number | null;
	neobook_likes: number | null;
	neobook_comments: number | null;
	featured_image_id: string | null;
	created_at: string;
}

interface TagRow {
	post_id: string;
	tag_name: string;
}

export class PostRepository {
	private readonly db: Db;
	private readonly mediaStorageEnabled: boolean;

	constructor(binding: D1Database, mediaStorageEnabled = true) {
		this.db = createDb(binding);
		this.mediaStorageEnabled = mediaStorageEnabled;
	}

	async list(options: {
		publicationId?: string;
		status?: PostStatus;
		/** 'published' orders by publish date; the default is last update. */
		sort?: 'published';
		limit: number;
		offset: number;
	}): Promise<AdminPost[]> {
		const conditions = [];
		if (options.publicationId) {
			conditions.push(eq(posts.publication_id, options.publicationId));
		}
		if (options.status) {
			conditions.push(eq(posts.status, options.status));
		}
		const rows = await this.db
			.select({
				id: posts.id,
				publication_id: posts.publication_id,
				publication: publications.slug,
				title: posts.title,
				slug: posts.slug,
				excerpt: posts.excerpt,
				content: posts.content,
				content_markdown: posts.content_markdown,
				status: posts.status,
				published_at: posts.published_at,
				updated_at: posts.updated_at,
				seo_title: posts.seo_title,
				seo_description: posts.seo_description,
				canonical_url: posts.canonical_url,
				blogger_blog_id: posts.blogger_blog_id,
				blogger_post_id: posts.blogger_post_id,
				neobook_url: posts.neobook_url,
				source: posts.source,
				neobook_views: posts.neobook_views,
				neobook_likes: posts.neobook_likes,
				neobook_comments: posts.neobook_comments,
				featured_image_id: posts.featured_image_id,
				created_at: posts.created_at,
			})
			.from(posts)
			.innerJoin(publications, eq(posts.publication_id, publications.id))
			.where(conditions.length ? and(...conditions) : undefined)
			.orderBy(
				...(options.sort === 'published'
					? [desc(posts.published_at)]
					: [desc(posts.updated_at), desc(posts.created_at)])
			)
			.limit(options.limit)
			.offset(options.offset);
		return this.hydrate(rows);
	}

	async getById(id: string): Promise<AdminPost | null> {
		const rows = await this.db
			.select({
				id: posts.id,
				publication_id: posts.publication_id,
				publication: publications.slug,
				title: posts.title,
				slug: posts.slug,
				excerpt: posts.excerpt,
				content: posts.content,
				content_markdown: posts.content_markdown,
				status: posts.status,
				published_at: posts.published_at,
				updated_at: posts.updated_at,
				seo_title: posts.seo_title,
				seo_description: posts.seo_description,
				canonical_url: posts.canonical_url,
				blogger_blog_id: posts.blogger_blog_id,
				blogger_post_id: posts.blogger_post_id,
				neobook_url: posts.neobook_url,
				source: posts.source,
				neobook_views: posts.neobook_views,
				neobook_likes: posts.neobook_likes,
				neobook_comments: posts.neobook_comments,
				featured_image_id: posts.featured_image_id,
				created_at: posts.created_at,
			})
			.from(posts)
			.innerJoin(publications, eq(posts.publication_id, publications.id))
			.where(eq(posts.id, id))
			.limit(1);
		if (rows.length === 0) {
			return null;
		}
		const tagged = await this.hydrate(rows);
		return tagged[0];
	}

	async existsBySlug(publicationId: string, slug: string, excludeId?: string): Promise<boolean> {
		const conditions = [eq(posts.publication_id, publicationId), eq(posts.slug, slug)];
		if (excludeId) {
			conditions.push(ne(posts.id, excludeId));
		}
		const rows = await this.db
			.select({ id: posts.id })
			.from(posts)
			.where(and(...conditions))
			.limit(1);
		return rows.length > 0;
	}

	async create(post: NewPost): Promise<AdminPost> {
		const id = crypto.randomUUID();
		const now = post.createdAt;
		await this.db
			.insert(posts)
			.values({
				id,
				publication_id: post.publicationId,
				title: post.title,
				slug: post.slug,
				excerpt: post.excerpt,
				content: post.content,
				content_markdown: post.contentMarkdown,
				seo_title: post.seoTitle,
				seo_description: post.seoDescription,
				status: post.status,
				published_at: post.publishedAt,
				featured_image_id: post.featuredImageId ?? null,
				created_at: now,
				updated_at: now,
			});
		await this.replaceTags(id, post.publicationId, post.tagNames);
		const created = await this.getById(id);
		if (!created) {
			throw new Error('Failed to load created post.');
		}
		return created;
	}

	async update(
		id: string,
		changes: Partial<Omit<NewPost, 'createdAt'>> & { updatedAt: string }
	): Promise<AdminPost> {
		const existing = await this.getById(id);
		if (!existing) {
			throw new Error('Post not found.');
		}
		const values: Record<string, unknown> = { updated_at: changes.updatedAt };
		if (changes.publicationId !== undefined) values.publication_id = changes.publicationId;
		if (changes.title !== undefined) values.title = changes.title;
		if (changes.slug !== undefined) values.slug = changes.slug;
		if (changes.excerpt !== undefined) values.excerpt = changes.excerpt;
		if (changes.content !== undefined) values.content = changes.content;
		if (changes.contentMarkdown !== undefined) values.content_markdown = changes.contentMarkdown;
		if (changes.seoTitle !== undefined) values.seo_title = changes.seoTitle;
		if (changes.seoDescription !== undefined) values.seo_description = changes.seoDescription;
		if (changes.status !== undefined) values.status = changes.status;
		if (changes.publishedAt !== undefined) values.published_at = changes.publishedAt;
		if (changes.featuredImageId !== undefined) values.featured_image_id = changes.featuredImageId;
		await this.db.update(posts).set(values).where(eq(posts.id, id));
		if (changes.tagNames !== undefined) {
			await this.replaceTags(id, changes.publicationId ?? existing.publicationId, changes.tagNames);
		}
		const updated = await this.getById(id);
		if (!updated) {
			throw new Error('Failed to load updated post.');
		}
		return updated;
	}

	async delete(id: string): Promise<boolean> {
		const existing = await this.db.select({ id: posts.id }).from(posts).where(eq(posts.id, id)).limit(1);
		if (existing.length === 0) {
			return false;
		}
		await this.db.batch([
			this.db.delete(postTags).where(eq(postTags.post_id, id)),
			this.db.delete(bloggerSync).where(eq(bloggerSync.post_id, id)),
			this.db.update(posts).set({ featured_image_id: null }).where(eq(posts.id, id)),
			this.db.delete(media).where(eq(media.post_id, id)),
			this.db.delete(posts).where(eq(posts.id, id)),
		]);
		return true;
	}

	async getMediaKeys(id: string): Promise<string[]> {
		const rows = await this.db
			.select({ r2_key: media.r2_key })
			.from(media)
			.where(eq(media.post_id, id));
		// External (Blogger-sourced) media rows have no R2 object to delete.
		return rows.map((row) => row.r2_key).filter((key): key is string => key !== null);
	}

	async setStatus(id: string, status: PostStatus, now: string): Promise<AdminPost> {
		const existing = await this.getById(id);
		if (!existing) {
			throw new Error('Post not found.');
		}
		const values: Record<string, unknown> = { status, updated_at: now };
		if (status === 'published' && !existing.publishedAt) {
			values.published_at = now;
		}
		await this.db.update(posts).set(values).where(eq(posts.id, id));
		const updated = await this.getById(id);
		if (!updated) {
			throw new Error('Failed to load updated post.');
		}
		return updated;
	}

	private async replaceTags(postId: string, publicationId: string, tagNames: string[]): Promise<void> {
		const names = [...new Set(tagNames.map((name) => name.trim()).filter(Boolean))];
		await this.db.delete(postTags).where(eq(postTags.post_id, postId));
		if (names.length === 0) {
			return;
		}

		const normalized = names.map((name) => ({ name, slug: slugifyTag(name) }));
		const existingRows = await this.db
			.select({ id: tags.id, slug: tags.slug })
			.from(tags)
			.where(and(eq(tags.publication_id, publicationId), inArray(tags.slug, normalized.map((n) => n.slug))));

		const existingBySlug = new Map(existingRows.map((row) => [row.slug, row.id]));
		const toInsert = normalized.filter((n) => !existingBySlug.has(n.slug));
		for (const item of toInsert) {
			const id = crypto.randomUUID();
			await this.db.insert(tags).values({
				id,
				publication_id: publicationId,
				name: item.name,
				slug: item.slug,
			});
			existingBySlug.set(item.slug, id);
		}

		for (const item of normalized) {
			const tagId = existingBySlug.get(item.slug);
			if (tagId) {
				await this.db.insert(postTags).values({ post_id: postId, tag_id: tagId });
			}
		}
	}

	private async hydrate(rows: PostRow[]): Promise<AdminPost[]> {
		if (rows.length === 0) {
			return [];
		}
		const postIds = rows.map((row) => row.id);
		const tagRows = await this.tagRowsFor(postIds);
		const tagsByPost = new Map<string, string[]>();
		for (const row of tagRows as TagRow[]) {
			const current = tagsByPost.get(row.post_id) ?? [];
			current.push(row.tag_name);
			tagsByPost.set(row.post_id, current);
		}
		// Media rows are post-owned (§28): a post's featured image is its own
		// attached media row, so the lookup keys on media.post_id.
		const featuredIds = [
			...new Set(rows.map((row) => row.featured_image_id).filter((id): id is string => id !== null))
		];
		const imagesByPost = new Map<string, FeaturedImage>();
		if (featuredIds.length > 0) {
			const mediaRows = await this.db
				.select({
					id: media.id,
					post_id: media.post_id,
					r2_key: media.r2_key,
					source_url: media.source_url,
					filename: media.filename,
					mime_type: media.mime_type,
				})
				.from(media)
				.where(inArray(media.id, featuredIds));
			for (const row of mediaRows) {
				imagesByPost.set(row.post_id, {
					id: row.id,
					url: mediaUrl(row, this.mediaStorageEnabled),
					filename: row.filename,
					mimeType: row.mime_type,
				});
			}
		}
		return rows.map((row) => ({
			id: row.id,
			publicationId: row.publication_id,
			publication: row.publication,
			title: row.title,
			slug: row.slug,
			excerpt: row.excerpt ?? '',
			content: row.content,
			contentMarkdown: row.content_markdown ?? '',
			tags: tagsByPost.get(row.id) ?? [],
			status: row.status as PostStatus,
			publishedAt: row.published_at,
			updatedAt: row.updated_at,
			seoTitle: row.seo_title,
			seoDescription: row.seo_description,
			canonicalUrl: row.canonical_url,
			bloggerBlogId: row.blogger_blog_id,
			bloggerPostId: row.blogger_post_id,
			neobookUrl: row.neobook_url,
			source: row.source,
			neobookViews: row.neobook_views,
			neobookLikes: row.neobook_likes,
			neobookComments: row.neobook_comments,
			featuredImageId: row.featured_image_id,
			featuredImage: (row.featured_image_id && imagesByPost.get(row.id)) || null,
			createdAt: row.created_at,
		}));
	}

	private async tagRowsFor(postIds: string[]) {
		return this.db
			.select({ post_id: postTags.post_id, tag_name: tags.name })
			.from(postTags)
			.innerJoin(tags, eq(postTags.tag_id, tags.id))
			.where(inArray(postTags.post_id, postIds));
	}

	async listTags(publicationId?: string): Promise<Array<{ id: string; publication_id: string; name: string; slug: string }>> {
		const rows = await this.db
			.select({
				id: tags.id,
				publication_id: tags.publication_id,
				name: tags.name,
				slug: tags.slug,
			})
			.from(tags)
			.where(publicationId ? eq(tags.publication_id, publicationId) : undefined)
			.orderBy(asc(tags.name));
		return rows;
	}
}

export function slugifyTag(value: string): string {
	const trimmed = value.toLowerCase().trim();
	if (!trimmed) {
		return '';
	}
	return trimmed
		.replace(/[^a-z0-9\s_-]/g, '')
		.replace(/[\s_]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

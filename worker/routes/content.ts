import { and, asc, desc, eq, lte } from 'drizzle-orm';
import { createDb } from '../db/client';
import { media, posts, postTags, publications, tags } from '../db/schema';
import { isMediaStorageEnabled, mediaUrl } from '../db/media';
import type { RouteHandler } from '../router';

interface ContentPublication {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	accent: string | null;
}

interface ContentTag {
	id: string;
	publication_id: string;
	name: string;
	slug: string;
}

export interface ContentPost {
	slug: string;
	title: string;
	excerpt: string;
	publication: string;
	tags: string[];
	pubDate: string;
	updatedDate?: string;
	status: 'published';
	content: string;
	seoTitle?: string;
	seoDescription?: string;
	featuredImage?: string;
	bloggerBlogId?: string;
	bloggerPostId?: string;
	bloggerUrl?: string;
	neobookUrl?: string;
	neobookViews?: number;
	neobookLikes?: number;
	neobookComments?: number;
}

interface ContentResponse {
	publications: ContentPublication[];
	posts: ContentPost[];
	tags: ContentTag[];
}

export const content: RouteHandler = async ({ env }) => {
	const db = createDb(env.DB);
	const now = new Date().toISOString();

	const [publicationsResult, tagsResult, postsResult, postTagsResult] = await Promise.all([
		db
			.select({
				id: publications.id,
				name: publications.name,
				slug: publications.slug,
				description: publications.description,
				accent: publications.accent,
			})
			.from(publications)
			.orderBy(asc(publications.slug)),
		db
			.selectDistinct({
				id: tags.id,
				publication_id: tags.publication_id,
				name: tags.name,
				slug: tags.slug,
			})
			.from(tags)
			.innerJoin(postTags, eq(postTags.tag_id, tags.id))
			.innerJoin(posts, eq(postTags.post_id, posts.id))
			.where(and(eq(posts.status, 'published'), lte(posts.published_at, now)))
			.orderBy(asc(tags.name)),
		db
			.select({
				title: posts.title,
				slug: posts.slug,
				excerpt: posts.excerpt,
				content: posts.content,
				pub_date: posts.published_at,
				updated_date: posts.updated_at,
				blogger_post_id: posts.blogger_post_id,
				blogger_blog_id: posts.blogger_blog_id,
				canonical_url: posts.canonical_url,
				neobook_url: posts.neobook_url,
				neobook_views: posts.neobook_views,
				neobook_likes: posts.neobook_likes,
				neobook_comments: posts.neobook_comments,
				seo_title: posts.seo_title,
				seo_description: posts.seo_description,
				publication: publications.slug,
				featured_r2_key: media.r2_key,
				featured_source_url: media.source_url,
			})
			.from(posts)
			.innerJoin(publications, eq(posts.publication_id, publications.id))
			.leftJoin(media, eq(posts.featured_image_id, media.id))
			.where(and(eq(posts.status, 'published'), lte(posts.published_at, now)))
			.orderBy(desc(posts.published_at)),
		db
			.select({
				publication: publications.slug,
				post_slug: posts.slug,
				tag_name: tags.name,
			})
			.from(postTags)
			.innerJoin(posts, eq(postTags.post_id, posts.id))
			.innerJoin(publications, eq(posts.publication_id, publications.id))
			.innerJoin(tags, eq(postTags.tag_id, tags.id)),
	]);

	const tagsByPost = new Map<string, string[]>();
	for (const row of postTagsResult) {
		const key = `${row.publication}/${row.post_slug}`;
		const existing = tagsByPost.get(key);
		if (existing) {
			existing.push(row.tag_name);
		} else {
			tagsByPost.set(key, [row.tag_name]);
		}
	}

	const contentPosts: ContentPost[] = postsResult.map((row) => {
		// The filter guarantees a non-null published date.
		const post: ContentPost = {
			slug: row.slug,
			title: row.title,
			excerpt: row.excerpt ?? '',
			publication: row.publication,
			tags: tagsByPost.get(`${row.publication}/${row.slug}`) ?? [],
			pubDate: row.pub_date ?? '',
			status: 'published',
			content: row.content,
		};
		if (row.seo_title) {
			post.seoTitle = row.seo_title;
		}
		if (row.seo_description) {
			post.seoDescription = row.seo_description;
		}
		if (row.blogger_blog_id) {
			post.bloggerBlogId = row.blogger_blog_id;
		}
		if (row.updated_date) {
			post.updatedDate = row.updated_date;
		}
		if (row.blogger_post_id) {
			post.bloggerPostId = row.blogger_post_id;
		}
		if (row.canonical_url) {
			post.bloggerUrl = row.canonical_url;
		}
		if (row.neobook_url) {
			post.neobookUrl = row.neobook_url;
		}
		// Counts are emitted only when positive so the public page can omit zeros.
		if (row.neobook_views && row.neobook_views > 0) {
			post.neobookViews = row.neobook_views;
		}
		if (row.neobook_likes && row.neobook_likes > 0) {
			post.neobookLikes = row.neobook_likes;
		}
		if (row.neobook_comments && row.neobook_comments > 0) {
			post.neobookComments = row.neobook_comments;
		}
		const featured = mediaUrl(
			{ r2_key: row.featured_r2_key, source_url: row.featured_source_url },
			isMediaStorageEnabled(env)
		);
		if (featured) {
			post.featuredImage = featured;
		}
		return post;
	});

	const response: ContentResponse = {
		publications: publicationsResult,
		posts: contentPosts,
		tags: tagsResult,
	};

	return new Response(JSON.stringify(response), {
		status: 200,
		headers: {
			'content-type': 'application/json; charset=utf-8',
			// Public published content; short TTL so a stale build never lingers.
			'cache-control': 'public, max-age=60',
		},
	});
};
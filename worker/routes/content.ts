import { and, asc, desc, eq, lte } from 'drizzle-orm';
import { createDb } from '../db/client';
import { categories, posts, postTags, publications, tags } from '../db/schema';
import type { RouteHandler } from '../router';

interface ContentPublication {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	accent: string | null;
}

interface ContentCategory {
	id: string;
	publication_id: string;
	name: string;
	slug: string;
}

interface ContentTag {
	id: string;
	name: string;
	slug: string;
}

export interface ContentPost {
	slug: string;
	title: string;
	excerpt: string;
	publication: string;
	category: string;
	tags: string[];
	pubDate: string;
	updatedDate?: string;
	status: 'published';
	content: string;
	bloggerPostId?: string;
	bloggerUrl?: string;
}

interface ContentResponse {
	publications: ContentPublication[];
	posts: ContentPost[];
	categories: ContentCategory[];
	tags: ContentTag[];
}

export const content: RouteHandler = async ({ env }) => {
	const db = createDb(env.DB);
	const now = new Date().toISOString();

	const [publicationsResult, categoriesResult, tagsResult, postsResult, postTagsResult] = await Promise.all([
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
			.select({
				id: categories.id,
				publication_id: categories.publication_id,
				name: categories.name,
				slug: categories.slug,
			})
			.from(categories)
			.orderBy(asc(categories.name)),
		db
			.select({ id: tags.id, name: tags.name, slug: tags.slug })
			.from(tags)
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
				canonical_url: posts.canonical_url,
				publication: publications.slug,
				category: categories.name,
			})
			.from(posts)
			.innerJoin(publications, eq(posts.publication_id, publications.id))
			.leftJoin(categories, eq(posts.category_id, categories.id))
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
			category: row.category ?? '',
			tags: tagsByPost.get(`${row.publication}/${row.slug}`) ?? [],
			pubDate: row.pub_date ?? '',
			status: 'published',
			content: row.content,
		};
		if (row.updated_date) {
			post.updatedDate = row.updated_date;
		}
		if (row.blogger_post_id) {
			post.bloggerPostId = row.blogger_post_id;
		}
		if (row.canonical_url) {
			post.bloggerUrl = row.canonical_url;
		}
		return post;
	});

	const response: ContentResponse = {
		publications: publicationsResult,
		posts: contentPosts,
		categories: categoriesResult,
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
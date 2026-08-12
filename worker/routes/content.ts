import type { RouteHandler } from '../router';

interface ContentPublication {
	id: string;
	name: string;
	slug: string;
	description: string | null;
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

interface PostRow {
	title: string;
	slug: string;
	excerpt: string | null;
	content: string;
	pub_date: string;
	updated_date: string | null;
	blogger_post_id: string | null;
	canonical_url: string | null;
	publication: string;
	category: string | null;
}

interface PostTagRow {
	publication: string;
	post_slug: string;
	tag_name: string;
}

export const content: RouteHandler = async ({ env }) => {
	const now = new Date().toISOString();

	const [publicationsResult, categoriesResult, tagsResult, postsResult, postTagsResult] =
		await env.DB.batch([
			env.DB.prepare('SELECT id, name, slug, description FROM publications ORDER BY slug'),
			env.DB.prepare('SELECT id, publication_id, name, slug FROM categories ORDER BY name'),
			env.DB.prepare('SELECT id, name, slug FROM tags ORDER BY name'),
			env.DB.prepare(
				`SELECT
					p.title,
					p.slug,
					p.excerpt,
					p.content,
					p.published_at AS pub_date,
					p.updated_at AS updated_date,
					p.blogger_post_id,
					p.canonical_url,
					pub.slug AS publication,
					cat.name AS category
				FROM posts p
				JOIN publications pub ON pub.id = p.publication_id
				LEFT JOIN categories cat ON cat.id = p.category_id
				WHERE p.status = 'published' AND p.published_at IS NOT NULL AND p.published_at <= ?
				ORDER BY p.published_at DESC`
			).bind(now),
			env.DB.prepare(
				`SELECT pub.slug AS publication, p.slug AS post_slug, t.name AS tag_name
				FROM post_tags pt
				JOIN posts p ON p.id = pt.post_id
				JOIN publications pub ON pub.id = p.publication_id
				JOIN tags t ON t.id = pt.tag_id`
			),
		]);

	const tagsByPost = new Map<string, string[]>();
	for (const row of postTagsResult.results as PostTagRow[]) {
		const key = `${row.publication}/${row.post_slug}`;
		const tags = tagsByPost.get(key);
		if (tags) {
			tags.push(row.tag_name);
		} else {
			tagsByPost.set(key, [row.tag_name]);
		}
	}

	const posts: ContentPost[] = (postsResult.results as PostRow[]).map((row) => {
		const post: ContentPost = {
			slug: row.slug,
			title: row.title,
			excerpt: row.excerpt ?? '',
			publication: row.publication,
			category: row.category ?? '',
			tags: tagsByPost.get(`${row.publication}/${row.slug}`) ?? [],
			pubDate: row.pub_date,
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
		publications: publicationsResult.results as ContentPublication[],
		posts,
		categories: categoriesResult.results as ContentCategory[],
		tags: tagsResult.results as ContentTag[],
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

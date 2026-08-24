import { getCollection } from 'astro:content';
import type { CollectionEntry } from 'astro:content';
import { slugify, sortByDateDesc } from './index';

export type Post = CollectionEntry<'posts'>;

export async function getPublishedPosts(): Promise<Post[]> {
	const posts = await getCollection('posts');
	return sortByDateDesc(posts, (post) => post.data.pubDate).filter((post) => post.data.status === 'published');
}

export async function getPostsForPublication(publicationSlug: string): Promise<Post[]> {
	const posts = await getPublishedPosts();
	return posts.filter((post) => post.data.publication === publicationSlug);
}

export interface TermCount {
	slug: string;
	name: string;
	count: number;
}

export async function getTagsForPublication(publicationSlug: string): Promise<TermCount[]> {
	const posts = await getPostsForPublication(publicationSlug);
	const counts = new Map<string, number>();
	for (const post of posts) {
		for (const tag of post.data.tags) {
			counts.set(tag, (counts.get(tag) ?? 0) + 1);
		}
	}
	return toTermCounts(counts);
}

export async function getPostsByTag(publicationSlug: string, tagName: string): Promise<Post[]> {
	const posts = await getPostsForPublication(publicationSlug);
	return posts.filter((post) => post.data.tags.includes(tagName));
}

function toTermCounts(counts: Map<string, number>): TermCount[] {
	return [...counts.entries()]
		.map(([name, count]) => ({ name, slug: slugify(name), count }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

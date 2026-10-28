import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { SITE } from '../lib/seo/config';
import { absoluteUrl } from '../lib/seo/seo';
import { getPublishedPosts } from '../lib/publications/collections';
import { postExcerpt, postPath } from '../lib/publications';

export async function GET(context: APIContext) {
	const posts = await getPublishedPosts();
	return rss({
		title: `${SITE.name} — Latest writing`,
		description: SITE.description,
		site: context.site ?? SITE.url,
		items: posts.map((post) => ({
			title: post.data.title,
			description: postExcerpt(post.data),
			pubDate: post.data.pubDate,
			link: absoluteUrl(postPath(post.data.publication, post.id)),
		})),
		customData: `<language>${SITE.locale}</language>`,
		stylesheet: absoluteUrl('/rss.xsl'),
	});
}

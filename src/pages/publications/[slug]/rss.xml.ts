import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { SITE } from '../../../lib/seo/config';
import { absoluteUrl } from '../../../lib/seo/seo';
import { getPostsForPublication } from '../../../lib/publications/collections';
import { getPublication, getPublications, postExcerpt, postPath } from '../../../lib/publications';

export function getStaticPaths() {
	return getPublications().map((publication) => ({ params: { slug: publication.slug } }));
}

export async function GET(context: APIContext) {
	const slug = context.params.slug ?? '';
	const publication = getPublication(slug);
	if (!publication) {
		return new Response('Not found', { status: 404 });
	}
	const posts = await getPostsForPublication(slug);
	return rss({
		title: `${publication.name} — ${SITE.name}`,
		description: publication.description,
		site: context.site ?? SITE.url,
		items: posts.map((post) => ({
			title: post.data.title,
			description: postExcerpt(post.data),
			pubDate: post.data.pubDate,
			link: absoluteUrl(postPath(publication.slug, post.id)),
		})),
		customData: `<language>${SITE.locale}</language>`,
		stylesheet: absoluteUrl('/rss.xsl'),
	});
}

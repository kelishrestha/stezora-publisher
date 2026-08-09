import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { SITE } from '../lib/seo/config';
import { absoluteUrl } from '../lib/seo/seo';

export function GET(context: APIContext) {
	return rss({
		title: `${SITE.name} — Latest writing`,
		description: SITE.description,
		site: context.site ?? SITE.url,
		items: [],
		customData: `<language>${SITE.locale}</language>`,
		stylesheet: absoluteUrl('/rss.xsl'),
	});
}

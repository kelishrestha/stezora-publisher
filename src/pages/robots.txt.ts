import type { APIContext } from 'astro';
import { SITE } from '../lib/seo/config';

export function GET(context: APIContext): Response {
	const base = (context.site?.toString() ?? SITE.url).replace(/\/+$/, '');
	const body = [
		'User-agent: *',
		'Allow: /',
		'',
		`Sitemap: ${base}/sitemap-index.xml`,
		'',
	].join('\n');
	return new Response(body, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
		},
	});
}

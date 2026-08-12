import type { RouteHandler } from '../router';

export const media: RouteHandler = async ({ env, params }) => {
	const key = params.key;
	const object = await env.MEDIA.get(key);
	if (!object) {
		return new Response(null, { status: 404 });
	}
	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('etag', object.httpEtag);
	headers.set('cache-control', 'public, max-age=31536000, immutable');
	headers.set('x-content-type-options', 'nosniff');
	return new Response(object.body, { headers });
};

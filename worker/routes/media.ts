import { createDb } from '../db/client';
import { MediaRepository } from '../db/media';
import { readAppSettings } from '../lib/settings';
import type { RouteHandler } from '../router';

/**
 * Serves media. When R2 storage is enabled (binding present, env gate on, and
 * the admin setting on) the object is streamed from R2. Otherwise, or when the
 * object is missing, the request falls back to the media row's external source
 * URL (a redirect), so imported images keep working without R2 in production.
 */
export const media: RouteHandler = async ({ env, params }) => {
	const key = params.key;

	const storageOn = Boolean(env.MEDIA) && env.ENABLE_MEDIA_STORAGE !== 'false' && (await readAppSettings(createDb(env.DB))).mediaStorageEnabled;

	if (storageOn && env.MEDIA) {
		const object = await env.MEDIA.get(key);
		if (object) {
			const headers = new Headers();
			object.writeHttpMetadata(headers);
			headers.set('etag', object.httpEtag);
			headers.set('cache-control', 'public, max-age=31536000, immutable');
			headers.set('x-content-type-options', 'nosniff');
			return new Response(object.body, { headers });
		}
	}

	// Fall back to the external source URL recorded for this media row.
	const row = await new MediaRepository(env.DB).getByKey(key);
	if (row?.source_url) {
		return Response.redirect(row.source_url, 302);
	}
	return new Response(null, { status: 404 });
};

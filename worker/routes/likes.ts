import { fail, ok } from '../lib/http';
import { isLikeEntity, likeSummary, likeVisitorId, toggleLike } from '../lib/likes';
import type { RouteHandler } from '../router';

/**
 * GET /api/likes/:type/:id*  -> current like summary for the entity.
 * POST /api/likes/:type/:id* -> toggles the visitor's like, returns the summary.
 * Public (no auth): the like button on the static site reads and writes these.
 */
export const getLikes: RouteHandler = async ({ env, request, params }) => {
	const type = params.type;
	const id = params.id;
	if (!isLikeEntity(type) || !id) {
		return fail('bad_request', 'Unknown like target.', 400);
	}
	const visitorId = await likeVisitorId(request, env);
	return ok(await likeSummary(env.DB, type, id, visitorId));
};

export const postLike: RouteHandler = async ({ env, request, params }) => {
	const type = params.type;
	const id = params.id;
	if (!isLikeEntity(type) || !id) {
		return fail('bad_request', 'Unknown like target.', 400);
	}
	const visitorId = await likeVisitorId(request, env);
	return ok(await toggleLike(env.DB, type, id, visitorId));
};

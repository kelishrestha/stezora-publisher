import { z } from 'zod';
import type { RouteContext, RouteHandler } from '../router';
import { ApiError } from './errors';
import { validateWith } from './validate';

export interface AdminUser {
	id: string;
	email: string;
	role: string;
}

export interface AuthenticatedContext extends RouteContext {
	user: AdminUser;
}

export type AuthenticatedHandler = (context: AuthenticatedContext) => Response | Promise<Response>;

/**
 * Middleware that wraps a handler with a cheap, declared-size pre-check.
 * Applied by wiring: `routes.get('/api/admin/stats', withBodyLimit(adminStats))`.
 *
 * NOTE: this checks the client-supplied `content-length` header only, which can
 * be omitted (chunked) or forged. It is a fast pre-filter, not a real byte
 * limit — handlers that read a body must enforce the limit on actual bytes
 * (see `readJsonBody` in `worker/lib/validate.ts`).
 */
export function withBodyLimit<C extends { request: Request }>(
	handler: (context: C) => Response | Promise<Response>,
	limitBytes = 2 * 1024 * 1024
): (context: C) => Response | Promise<Response> {
	return async (context) => {
		const declared = Number(context.request.headers.get('content-length') ?? 0);
		if (declared > limitBytes) {
			throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds the size limit.');
		}
		return handler(context);
	};
}

/**
 * Requires an authenticated admin user. The session cookie is verified in
 * P4.1; until then the guard always rejects so protected routes are closed by
 * default (DEVELOPER.md §12: never rely on UI hiding for security).
 */
export function requireAdmin(handler: AuthenticatedHandler): RouteHandler {
	return async (context) => {
		const user = await authenticateSession(context.request);
		if (!user) {
			throw new ApiError(401, 'UNAUTHORIZED', 'Authentication required.');
		}
		return handler({ ...context, user });
	};
}

export function requireRole(handler: AuthenticatedHandler, role: string): RouteHandler {
	return requireAdmin(async (context) => {
		if (context.user.role !== role) {
			throw new ApiError(403, 'FORBIDDEN', 'Insufficient permissions.');
		}
		return handler(context);
	});
}

export function validatePagination(query: unknown): { limit: number; offset: number } {
	return validateWith(
		z.object({
			limit: z.coerce.number().int().min(1).max(100).default(20),
			offset: z.coerce.number().int().min(0).default(0),
		}),
		query
	);
}

/**
 * Resolves the admin user from the session cookie. Implemented in P4.1
 * (session token signed with AUTH_SECRET); returns null until then so
 * protected routes stay locked.
 */
async function authenticateSession(request: Request): Promise<AdminUser | null> {
	void request;
	return null;
}

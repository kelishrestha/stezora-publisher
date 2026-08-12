import { routes } from './routes';
import { fail } from './lib/http';
import { toApiError } from './lib/errors';

function errorSummary(error: unknown): { name: string; message: string } {
	if (error instanceof Error) {
		return { name: error.name, message: error.message };
	}
	return { name: typeof error, message: String(error) };
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) {
			const requestId = crypto.randomUUID();
			const match = routes.match(url.pathname, request.method);
			if (match.kind === 'match') {
				try {
					const response = await match.handler({ request, env, ctx, params: match.params });
					response.headers.set('x-request-id', requestId);
					return response;
				} catch (error) {
					const apiError = toApiError(error);
					const { name, message } = errorSummary(error);
					console.error('api_route_failed', {
						requestId,
						method: request.method,
						path: url.pathname,
						code: apiError.code,
						error: name,
						message,
					});
					return fail(apiError.code, apiError.message, apiError.status, { 'x-request-id': requestId });
				}
			}
			if (match.kind === 'method-not-allowed') {
				return fail('METHOD_NOT_ALLOWED', 'Method not allowed.', 405, { 'x-request-id': requestId });
			}
			return fail('NOT_FOUND', 'Not found.', 404, { 'x-request-id': requestId });
		}

		return env.ASSETS.fetch(request);
	},
};

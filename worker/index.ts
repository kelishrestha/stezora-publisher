import { routes } from './routes';

const API_ERROR_BODY = {
	success: false,
	error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' },
} as const;

const METHOD_NOT_ALLOWED_BODY = {
	success: false,
	error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' },
} as const;

const NOT_FOUND_BODY = {
	success: false,
	error: { code: 'NOT_FOUND', message: 'Not found.' },
} as const;

function json(body: unknown, status: number, headers?: Record<string, string>): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
	});
}

function errorSummary(error: unknown): { name: string; message: string } {
	if (error instanceof Error) {
		return { name: error.name, message: error.message };
	}
	return { name: typeof error, message: String(error) };
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname.startsWith('/api/')) {
			const requestId = crypto.randomUUID();
			const match = routes.match(url.pathname, request.method);
			if (match.kind === 'match') {
				try {
					const response = await match.handler({ request, env, ctx, params: match.params });
					response.headers.set('x-request-id', requestId);
					return response;
				} catch (error) {
					const { name, message } = errorSummary(error);
					console.error('api_route_failed', { requestId, method: request.method, path: url.pathname, error: name, message });
					return json(API_ERROR_BODY, 500, { 'x-request-id': requestId });
				}
			}
			if (match.kind === 'method-not-allowed') {
				return json(METHOD_NOT_ALLOWED_BODY, 405, { 'x-request-id': requestId });
			}
			return json(NOT_FOUND_BODY, 404, { 'x-request-id': requestId });
		}

		return env.ASSETS.fetch(request);
	},
};

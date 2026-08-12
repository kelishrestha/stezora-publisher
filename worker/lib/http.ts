const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' } as const;

export interface ApiSuccess<T> {
	success: true;
	data: T;
}

export interface ApiFailure {
	success: false;
	error: { code: string; message: string };
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

export function ok<T>(data: T, status = 200, headers?: Record<string, string>): Response {
	return new Response(JSON.stringify({ success: true, data } satisfies ApiEnvelope<T>), {
		status,
		headers: { ...JSON_HEADERS, ...headers },
	});
}

export function fail(code: string, message: string, status: number, headers?: Record<string, string>): Response {
	return new Response(
		JSON.stringify({ success: false, error: { code, message } } satisfies ApiEnvelope<never>),
		{ status, headers: { ...JSON_HEADERS, ...headers } }
	);
}

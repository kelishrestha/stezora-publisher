import { z } from 'zod';
import { ApiError } from './errors';

export function validateWith<T>(schema: z.ZodType<T>, data: unknown): T {
	return schema.parse(data);
}

export function validateQuery<T>(schema: z.ZodType<T>, url: URL): T {
	return schema.parse(Object.fromEntries(url.searchParams.entries()));
}

export function validateParams<T>(schema: z.ZodType<T>, params: Record<string, string>): T {
	return schema.parse(params);
}

export const DEFAULT_JSON_BODY_LIMIT = 2 * 1024 * 1024;

export async function readJsonBody(request: Request, limitBytes = DEFAULT_JSON_BODY_LIMIT): Promise<unknown> {
	const declared = Number(request.headers.get('content-length') ?? 0);
	if (declared > limitBytes) {
		throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds the size limit.');
	}
	const text = await request.text();
	if (new TextEncoder().encode(text).byteLength > limitBytes) {
		throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds the size limit.');
	}
	try {
		return JSON.parse(text) as unknown;
	} catch {
		throw new ApiError(400, 'INVALID_JSON', 'Request body is not valid JSON.');
	}
}

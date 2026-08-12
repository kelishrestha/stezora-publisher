import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { fail, ok } from '../../worker/lib/http';
import { ApiError, toApiError } from '../../worker/lib/errors';
import { validateWith } from '../../worker/lib/validate';
import { withBodyLimit, validatePagination } from '../../worker/lib/middleware';

describe('response envelope', () => {
	it('wraps success payloads as { success: true, data }', async () => {
		const response = ok({ slug: 'the-sore-transition' });
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toMatch(/^application\/json/);
		expect(await response.json()).toEqual({ success: true, data: { slug: 'the-sore-transition' } });
	});

	it('wraps failures as { success: false, error } with the given status', async () => {
		const response = fail('POST_NOT_FOUND', 'Post was not found.', 404);
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			success: false,
			error: { code: 'POST_NOT_FOUND', message: 'Post was not found.' },
		});
	});
});

describe('error mapping', () => {
	it('maps ApiError to its own status and code', () => {
		const mapped = toApiError(new ApiError(409, 'IN_USE', 'Category is in use.'));
		expect(mapped).toBeInstanceOf(ApiError);
		expect(mapped.status).toBe(409);
		expect(mapped.code).toBe('IN_USE');
		expect(mapped.message).toBe('Category is in use.');
	});

	it('maps zod errors to 400 VALIDATION_ERROR', () => {
		let thrown: unknown;
		try {
			z.object({ title: z.string() }).parse({});
		} catch (error) {
			thrown = error;
		}
		const mapped = toApiError(thrown);
		expect(mapped.status).toBe(400);
		expect(mapped.code).toBe('VALIDATION_ERROR');
	});

	it('maps unknown errors to 500 INTERNAL_ERROR with a generic message', () => {
		const mapped = toApiError(new Error('connection string leaked: postgres://user:pass@host/db'));
		expect(mapped.status).toBe(500);
		expect(mapped.code).toBe('INTERNAL_ERROR');
		expect(mapped.message).not.toContain('postgres://');
		expect(mapped.message).not.toContain('connection string');
	});
});

describe('request validation', () => {
	const schema = z.object({ title: z.string().min(1), publication: z.string() });

	it('validatesWith parses conforming data', () => {
		expect(validateWith(schema, { title: 'Hello', publication: 'the-sore-transition' })).toEqual({
			title: 'Hello',
			publication: 'the-sore-transition',
		});
	});

	it('throws a zod error for invalid data', () => {
		expect(() => validateWith(schema, { title: '' })).toThrow(z.ZodError);
	});

	it('validatePagination clamps and defaults', () => {
		expect(validatePagination({})).toEqual({ limit: 20, offset: 0 });
		expect(validatePagination({ limit: '50', offset: '10' })).toEqual({ limit: 50, offset: 10 });
		expect(() => validatePagination({ limit: 1000 })).toThrow(z.ZodError);
	});
});

describe('middleware', () => {
	async function dispatchAsWorker(handler: (context: { request: Request }) => Response | Promise<Response>, request: Request) {
		try {
			return await handler({ request });
		} catch (error) {
			const apiError = toApiError(error);
			return fail(apiError.code, apiError.message, apiError.status);
		}
	}

	it('rejects an oversized request body via withBodyLimit', async () => {
		const handler = withBodyLimit(async () => new Response('ok', { status: 200 }), 10);
		const request = new Request('http://localhost/api/test', {
			method: 'POST',
			headers: { 'content-length': '100' },
		});
		const response = await dispatchAsWorker(handler, request);
		expect(response.status).toBe(413);
		expect(await response.json()).toMatchObject({
			success: false,
			error: { code: 'PAYLOAD_TOO_LARGE' },
		});
	});

	it('passes bodies within the limit through withBodyLimit', async () => {
		const handler = withBodyLimit(async () => new Response('ok', { status: 200 }), 10);
		const request = new Request('http://localhost/api/test', {
			method: 'POST',
			headers: { 'content-length': '5' },
		});
		const response = await dispatchAsWorker(handler, request);
		expect(response.status).toBe(200);
	});
});

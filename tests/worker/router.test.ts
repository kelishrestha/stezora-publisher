import { describe, expect, it } from 'vitest';
import { Router } from '../../worker/router';

describe('worker router', () => {
	const router = new Router()
		.get('/api/posts', () => new Response('ok', { status: 200 }))
		.get('/api/posts/:id', (ctx) => new Response(ctx.params.id, { status: 200 }))
		.post('/api/posts', () => new Response('created', { status: 201 }));

	it('matches an exact path and returns the handler', () => {
		const result = router.match('/api/posts', 'GET');

		if (result.kind !== 'match') throw new Error(`expected a match, got ${result.kind}`);
		expect(result.params).toEqual({});
		expect(typeof result.handler).toBe('function');
	});

	it('captures path parameters', () => {
		const result = router.match('/api/posts/123', 'GET');

		expect(result).toMatchObject({ kind: 'match', params: { id: '123' } });
	});

	it('decodes path parameters', () => {
		const result = router.match('/api/posts/hello%20world', 'GET');

		expect(result).toMatchObject({ kind: 'match', params: { id: 'hello world' } });
	});

	it('normalizes a trailing slash', () => {
		const result = router.match('/api/posts/', 'GET');

		expect(result).toMatchObject({ kind: 'match', params: {} });
	});

	it('returns not-found for an unknown path', () => {
		expect(router.match('/api/unknown', 'GET')).toEqual({ kind: 'not-found' });
	});

	it('returns not-found for a malformed path parameter', () => {
		expect(router.match('/api/posts/%zz', 'GET')).toEqual({ kind: 'not-found' });
	});

	it('returns method-not-allowed when the path exists for another method', () => {
		expect(router.match('/api/posts', 'DELETE')).toEqual({ kind: 'method-not-allowed' });
	});

	describe('rest parameters', () => {
		const restRouter = new Router().get('/media/:key*', (ctx) => new Response(ctx.params.key, { status: 200 }));

		it('captures a single-segment key', () => {
			expect(restRouter.match('/media/hero.png', 'GET')).toMatchObject({
				kind: 'match',
				params: { key: 'hero.png' },
			});
		});

		it('captures a nested key across segments', () => {
			expect(restRouter.match('/media/localized/m-abc.jpg', 'GET')).toMatchObject({
				kind: 'match',
				params: { key: 'localized/m-abc.jpg' },
			});
		});

		it('decodes each segment of a nested key', () => {
			expect(restRouter.match('/media/localized/hello%20world.png', 'GET')).toMatchObject({
				kind: 'match',
				params: { key: 'localized/hello world.png' },
			});
		});

		it('requires at least one segment for the rest parameter', () => {
			expect(restRouter.match('/media', 'GET')).toEqual({ kind: 'not-found' });
		});

		it('rejects a rest parameter that is not the last segment', () => {
			expect(() => new Router().get('/media/:key*/extra', () => new Response('x'))).toThrow(
				/Rest parameter must be the last segment/
			);
		});
	});
});

import { describe, expect, it, vi } from 'vitest';
import { BloggerClient } from '../src/lib/blogger/client';
import type { BloggerClientConfig } from '../src/lib/blogger/types';

function clientWithFetch(fetchImpl: typeof fetch, overrides: Partial<BloggerClientConfig> = {}): BloggerClient {
	return new BloggerClient({
		blogId: 'blog-id',
		clientId: 'client-id',
		clientSecret: 'client-secret',
		refreshToken: 'refresh-token',
		tokenUrl: 'https://oauth.example/token',
		baseUrl: 'https://blogger.example/v3',
		fetchImpl,
		...overrides,
	});
}

describe('blogger client', () => {
	it('refreshes the access token and lists posts', async () => {
		const tokenResponse = new Response(JSON.stringify({ access_token: 'token-1', expires_in: 3600 }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
		const listResponse = new Response(JSON.stringify({ items: [{ id: '1' }] }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
		const fetchImpl = vi.fn(async () => listResponse);
		fetchImpl.mockResolvedValueOnce(tokenResponse);

		const client = clientWithFetch(fetchImpl as unknown as typeof fetch);
		const page = await client.listPosts();

		expect(page.items).toHaveLength(1);
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});

	it('sends each status as a repeated uppercase query param, never comma-joined', async () => {
		const tokenResponse = new Response(JSON.stringify({ access_token: 'token-1', expires_in: 3600 }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
		const listResponse = new Response(JSON.stringify({ items: [] }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
		const urls: string[] = [];
		const fetchImpl = vi.fn(async (input: unknown) => {
			urls.push(String(input));
			return listResponse;
		});
		fetchImpl.mockResolvedValueOnce(tokenResponse);

		const client = clientWithFetch(fetchImpl as unknown as typeof fetch);
		await client.listPosts({ statuses: ['LIVE', 'DRAFT'] });

		const listUrl = urls[urls.length - 1];
		expect(listUrl).toContain('status=LIVE');
		expect(listUrl).toContain('status=DRAFT');
		// Must be repeated params, not a single comma-joined value.
		expect(listUrl).not.toContain('status=LIVE%2CDRAFT');
		expect(listUrl).not.toContain('status=live');
	});

	it('retries with backoff on 429 and succeeds', async () => {
		const tokenResponse = new Response(JSON.stringify({ access_token: 'token-1', expires_in: 3600 }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
		const tooMany = new Response('rate limited', { status: 429, headers: { 'Retry-After': '0' } });
		const ok = new Response(JSON.stringify({ items: [{ id: '2' }] }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
		const fetchImpl = vi.fn(async () => ok);
		fetchImpl.mockResolvedValueOnce(tokenResponse);
		fetchImpl.mockResolvedValueOnce(tooMany);

		const client = clientWithFetch(fetchImpl as unknown as typeof fetch);
		const page = await client.listPosts();

		expect(page.items).toHaveLength(1);
		expect(fetchImpl).toHaveBeenCalledTimes(3);
	});

	it('throws after exhausting retries on 5xx', async () => {
		const tokenResponse = new Response(JSON.stringify({ access_token: 'token-1', expires_in: 3600 }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
		const serverError = new Response('boom', { status: 500 });
		const fetchImpl = vi.fn(async () => serverError);
		fetchImpl.mockResolvedValueOnce(tokenResponse);

		const client = clientWithFetch(fetchImpl as unknown as typeof fetch);

		await expect(client.listPosts()).rejects.toThrow(/Blogger API request failed: 500/);
		expect(fetchImpl).toHaveBeenCalledTimes(5);
	});

	it('invokes fetch with the global scope as `this`, not the client', async () => {
		// Regression guard: calling `this.fetchImpl(...)` would bind `this` to the
		// client, which workerd rejects with "Illegal invocation" for native fetch.
		const receivers: unknown[] = [];
		const ok = () => new Response(JSON.stringify({ access_token: 't', expires_in: 3600, items: [] }), { headers: { 'Content-Type': 'application/json' } });
		function fetchImpl(this: unknown) {
			receivers.push(this);
			return Promise.resolve(ok());
		}

		const client = clientWithFetch(fetchImpl as unknown as typeof fetch);
		await client.listPosts();
		await client.getPageviews();

		expect(receivers.length).toBeGreaterThan(0);
		expect(receivers.every((receiver) => receiver === globalThis)).toBe(true);
	});

	it('fetches blog-level pageviews', async () => {
		const tokenResponse = new Response(JSON.stringify({ access_token: 'token-1', expires_in: 3600 }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
		const pageviews = new Response(JSON.stringify({ blogId: 'blog-id', counts: [{ count: '42', timeRange: 'ALL_TIME' }] }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
		const fetchImpl = vi.fn(async () => pageviews);
		fetchImpl.mockResolvedValueOnce(tokenResponse);

		const client = clientWithFetch(fetchImpl as unknown as typeof fetch);
		const result = await client.getPageviews();

		expect(result.counts?.[0]).toEqual({ count: '42', timeRange: 'ALL_TIME' });
	});
});

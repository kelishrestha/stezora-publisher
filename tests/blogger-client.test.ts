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
});

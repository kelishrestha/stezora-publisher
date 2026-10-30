import type { BloggerClientConfig, BloggerListOptions, BloggerListResponse, BloggerPageviews, BloggerPostDto } from './types';

const DEFAULT_BASE_URL = 'https://www.googleapis.com/blogger/v3';
const DEFAULT_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 500;

interface OAuthTokenResponse {
	access_token?: string;
	expires_in?: number;
	token_type?: string;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export class BloggerClient {
	private readonly config: BloggerClientConfig;
	private accessToken: string | null = null;
	private tokenExpiresAt = 0;

	constructor(config: BloggerClientConfig) {
		this.config = config;
	}

	private get fetchImpl(): typeof fetch {
		return this.config.fetchImpl ?? fetch;
	}

	private async refreshAccessToken(): Promise<string> {
		const body = new URLSearchParams({
			client_id: this.config.clientId,
			client_secret: this.config.clientSecret,
			refresh_token: this.config.refreshToken,
			grant_type: 'refresh_token',
		});

		const response = await this.fetchImpl((this.config.tokenUrl ?? DEFAULT_TOKEN_URL).toString(), {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body,
		});

		if (!response.ok) {
			throw new Error(`Failed to refresh Blogger access token: ${response.status} ${await response.text()}`);
		}

		const data = (await response.json()) as OAuthTokenResponse;
		if (!data.access_token) {
			throw new Error('OAuth token response did not include an access token');
		}

		this.accessToken = data.access_token;
		this.tokenExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000;
		return this.accessToken;
	}

	private async getAccessToken(): Promise<string> {
		if (this.accessToken && Date.now() < this.tokenExpiresAt) {
			return this.accessToken;
		}
		return this.refreshAccessToken();
	}

	private async fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
		let lastResponse: Response | undefined;
		for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
			const response = await this.fetchImpl(url, init);
			lastResponse = response;
			if (!isRetryableStatus(response.status) || attempt === MAX_RETRIES) {
				return response;
			}
			await sleep(retryDelayMs(response, attempt));
		}
		return lastResponse as Response;
	}

	async listPosts(options: BloggerListOptions = {}): Promise<BloggerListResponse> {
		const query = new URLSearchParams({
			fetchImages: 'false',
			maxResults: String(options.maxResults ?? 100),
			orderBy: 'UPDATED',
		});
		if (options.pageToken) {
			query.set('pageToken', options.pageToken);
		}
		// `status` is a repeated enum: append one `status=` per value
		// (status=LIVE&status=DRAFT), never a comma-joined string.
		for (const status of options.statuses ?? []) {
			query.append('status', status);
		}

		const url = `${DEFAULT_BASE_URL}/blogs/${this.config.blogId}/posts?${query}`;
		const token = await this.getAccessToken();

		const response = await this.fetchWithRetry(url, {
			headers: { Authorization: `Bearer ${token}` },
		});

		if (!response.ok) {
			throw new Error(`Blogger API request failed: ${response.status} ${await response.text()}`);
		}

		return (await response.json()) as BloggerListResponse;
	}

	/**
	 * Blog-level pageview totals (all time, 30 days, 7 days). Owner-only data,
	 * so it needs the OAuth token; Blogger exposes no per-post breakdown here.
	 */
	async getPageviews(): Promise<BloggerPageviews> {
		const url = `${DEFAULT_BASE_URL}/blogs/${this.config.blogId}/pageviews`;
		const token = await this.getAccessToken();
		const response = await this.fetchWithRetry(url, { headers: { Authorization: `Bearer ${token}` } });
		if (!response.ok) {
			throw new Error(`Blogger pageviews request failed: ${response.status} ${await response.text()}`);
		}
		return (await response.json()) as BloggerPageviews;
	}

	async *fetchAllPosts(options: Omit<BloggerListOptions, 'pageToken'> = {}): AsyncGenerator<BloggerPostDto> {
		let pageToken: string | undefined;
		let pageCount = 0;

		do {
			const page = await this.listPosts({ ...options, pageToken });
			pageCount += 1;

			for (const post of page.items ?? []) {
				yield post;
			}

			pageToken = page.nextPageToken;
			if (pageToken && pageCount > 200) {
				throw new Error('Blogger pagination exceeded 200 pages; aborting to avoid an infinite loop');
			}
		} while (pageToken);
	}
}

function isRetryableStatus(status: number): boolean {
	return status === 429 || status >= 500;
}

function retryDelayMs(response: Response, attempt: number): number {
	const retryAfter = response.headers.get('retry-after');
	if (retryAfter) {
		const seconds = Number(retryAfter);
		if (Number.isFinite(seconds) && seconds >= 0) {
			return seconds * 1000;
		}
	}
	return BASE_RETRY_DELAY_MS * 2 ** attempt;
}

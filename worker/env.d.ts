interface Env {
	ASSETS: Fetcher;
	/** Absent when the deployment runs without R2. */
	MEDIA?: R2Bucket;
	/** "false" serves media from external source URLs instead of R2. */
	ENABLE_MEDIA_STORAGE?: string;
	BETTER_AUTH_SECRET: string;
	/**
	 * Canonical site origin (for example https://stezora.example). When set, the
	 * auth session's baseURL and trusted origin are pinned to it instead of the
	 * request's host. Unset in local dev and tests, where the request origin is
	 * used.
	 */
	BETTER_AUTH_URL?: string;
	/** Bearer token for the CI backup export; unset disables token auth. */
	BACKUP_TOKEN?: string;
	/**
	 * Salt for the daily-rotated pageview visitor hash. Optional: falls back to
	 * BETTER_AUTH_SECRET so analytics works without extra configuration.
	 */
	ANALYTICS_SALT?: string;
	/**
	 * Blogger OAuth credentials for the admin import. All three are required for
	 * the import to run; unset, the import endpoint returns a clear error. Blog
	 * ids are not configured here, they are read from the already-linked posts.
	 */
	BLOGGER_CLIENT_ID?: string;
	BLOGGER_CLIENT_SECRET?: string;
	BLOGGER_REFRESH_TOKEN?: string;
}

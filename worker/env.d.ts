interface Env {
	ASSETS: Fetcher;
	/** Absent when the deployment runs without R2. */
	MEDIA?: R2Bucket;
	/** "false" serves media from external source URLs instead of R2. */
	ENABLE_MEDIA_STORAGE?: string;
	BETTER_AUTH_SECRET: string;
	/** Bearer token for the CI backup export; unset disables token auth. */
	BACKUP_TOKEN?: string;
}

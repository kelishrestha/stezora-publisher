interface Env {
	ASSETS: Fetcher;
	BETTER_AUTH_SECRET: string;
	/** Bearer token for the CI backup export; unset disables token auth. */
	BACKUP_TOKEN?: string;
}

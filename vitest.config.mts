import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
	const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));

	return {
		test: {
			projects: [
				{
					test: {
						name: 'unit',
						include: ['tests/**/*.test.ts'],
						exclude: ['tests/worker/**', 'node_modules/**', 'dist/**'],
					},
				},
				{
					plugins: [
						cloudflareTest({
							wrangler: { configPath: './wrangler.jsonc' },
							miniflare: {
								// wrangler.jsonc ships without R2 (media storage disabled in
								// production for now); tests keep exercising storage mode.
								r2Buckets: ['MEDIA'],
								bindings: {
									TEST_MIGRATIONS: migrations,
									ENABLE_MEDIA_STORAGE: 'true',
									// Test-only value; never a real secret.
									BETTER_AUTH_SECRET: 'vitest-better-auth-secret',
								},
							},
						}),
					],
					test: {
						name: 'worker',
						include: ['tests/worker/**/*.test.ts'],
						setupFiles: ['./tests/worker/apply-migrations.ts'],
						deps: {
							optimizer: {
								ssr: {
									enabled: true,
									include: ['sanitize-html'],
								},
							},
						},
					},
				},
			],
		},
	};
});

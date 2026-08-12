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
								bindings: { TEST_MIGRATIONS: migrations },
							},
						}),
					],
					test: {
						name: 'worker',
						include: ['tests/worker/**/*.test.ts'],
						setupFiles: ['./tests/worker/apply-migrations.ts'],
					},
				},
			],
		},
	};
});

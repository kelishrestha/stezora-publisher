import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
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
					}),
				],
				test: {
					name: 'worker',
					include: ['tests/worker/**/*.test.ts'],
				},
			},
		],
	},
});

// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

import { SITE } from './src/lib/seo/config';

// https://astro.build/config
export default defineConfig({
	site: SITE.url,
	integrations: [sitemap()],
	vite: {
		plugins: [tailwindcss()],
	},
});

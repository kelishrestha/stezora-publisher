// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import icon from 'astro-icon';

import { SITE } from './src/lib/seo/config';

// https://astro.build/config
export default defineConfig({
	site: SITE.url,
	integrations: [
		sitemap({
			// Only public, indexable pages belong in the sitemap (§57). The CMS
			// shell (/admin/*) is excluded; drafts/scheduled-future/archived never
			// generate pages, so they can never appear here. `page` is absolute.
			filter: (page) => !new URL(page).pathname.startsWith('/admin'),
		}),
		react(),
		icon(),
	],
	vite: {
		plugins: [tailwindcss()],
	},
});

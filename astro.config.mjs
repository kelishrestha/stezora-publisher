// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';

import { SITE } from './src/lib/seo/config';

// https://astro.build/config
export default defineConfig({
	site: SITE.url,
	integrations: [sitemap(), react()],
	vite: {
		plugins: [tailwindcss()],
	},
});

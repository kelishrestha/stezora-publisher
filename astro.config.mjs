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
	security: {
		// Defense-in-depth against XSS: post content is already sanitized on
		// every write (worker/lib/markdown.ts), but a CSP is the second layer if
		// the sanitizer is ever bypassed. Astro emits per-page SHA-256 hashes for
		// its own inline scripts and styles (including the JSON-LD block), so
		// script-src and style-src stay locked to 'self' plus those hashes with no
		// 'unsafe-inline'. The directives below lock the remaining resource types.
		// There are no inline style attributes in the output (cosmetic delays use
		// Tailwind classes), so no style-src-attr allowance is needed.
		// frame-ancestors is intentionally omitted here (a <meta> CSP cannot set
		// it); X-Frame-Options: DENY in public/_headers handles clickjacking.
		csp: {
			directives: [
				"default-src 'self'",
				"base-uri 'self'",
				"object-src 'none'",
				"form-action 'self'",
				// Images may be same-origin (/media/*) or remote (Blogger CDN when
				// media storage is disabled); images cannot execute, so https: is safe.
				"img-src 'self' https: data:",
				"font-src 'self'",
				"connect-src 'self'",
			],
		},
	},
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

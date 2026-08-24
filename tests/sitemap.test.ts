import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const config = readFileSync(join(root, 'astro.config.mjs'), 'utf8');

describe('sitemap config', () => {
	it('uses the @astrojs/sitemap integration so /sitemap-index.xml is generated', () => {
		expect(config).toMatch(/sitemap\(/);
		expect(config).toContain('@astrojs/sitemap');
	});

	it('excludes the CMS shell (/admin/*) from the sitemap (§57)', () => {
		expect(config).toContain("startsWith('/admin')");
	});

	it('keeps robots.txt pointed at the sitemap index', () => {
		const robots = readFileSync(join(root, 'src/pages/robots.txt.ts'), 'utf8');
		expect(robots).toContain('/sitemap-index.xml');
	});

	it('keeps the base layout sitemap link pointed at the sitemap index', () => {
		const layout = readFileSync(join(root, 'src/layouts/BaseLayout.astro'), 'utf8');
		expect(layout).toContain('/sitemap-index.xml');
	});
});

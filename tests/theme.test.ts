import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));

const colorsCss = readFileSync(join(root, 'COLORS.md'), 'utf8');
const themeCss = readFileSync(join(root, 'src/styles/theme.css'), 'utf8');

function sourceFiles(directory: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(directory)) {
		const full = join(directory, entry);
		if (statSync(full).isDirectory()) {
			files.push(...sourceFiles(full));
		} else if (/\.(astro|ts|tsx|jsx)$/.test(entry)) {
			files.push(full);
		}
	}
	return files;
}

const PALETTE_UTILITY =
	/(?:[\w-]+:)*(?:bg|text|border|border-x|border-y|ring|from|to|via|divide|fill|stroke|decoration|outline|placeholder|shadow|accent|caret|selection|prose)-(?:white|black|slate|gray)(?:-\d+)?/;

describe('COLORS.md → theme.css', () => {
	it('mirrors every ramp value from COLORS.md', () => {
		const rampAssignments = [...colorsCss.matchAll(/--color-([a-z-]+-\d+):\s*(.+);/g)].map(
			(match) => `${match[1]}: ${match[2]}`
		);
		expect(rampAssignments.length).toBeGreaterThanOrEqual(55);
		for (const assignment of rampAssignments) {
			expect(themeCss, `missing ${assignment}`).toContain(assignment);
		}
	});

	it('defines light-mode semantic rules from COLORS.md', () => {
		expect(themeCss).toContain('--color-background: oklch(100% 0 0);');
		expect(themeCss).toContain('--color-primary: var(--color-soft-periwinkle-400);');
		expect(themeCss).toContain('--color-secondary: oklch(95% 0.006 264.53);');
		expect(themeCss).toContain('--color-accent: oklch(91.5% 0 0);');
		expect(themeCss).toContain('--color-muted: oklch(92% 0 0);');
	});

	it('defines dark-mode semantic rules from COLORS.md', () => {
		expect(themeCss).toContain('--color-background: oklch(14.5% 0 0);');
		expect(themeCss).toContain('--color-primary: oklch(98.5% 0 0);');
		expect(themeCss).toContain('--color-secondary: oklch(26.9% 0 0);');
		expect(themeCss).toContain('--color-accent: oklch(26.9% 0 0);');
		expect(themeCss).toContain('--color-muted: oklch(26.9% 0 0);');
	});

	it('defines the three assigned per-publication accent overrides', () => {
		for (const accent of ['space-indigo', 'dark-amaranth', 'ocean-deep']) {
			expect(themeCss).toContain(`[data-accent='${accent}']`);
		}
	});

	it('publication palettes override only the accent family, never the background', () => {
		for (const palette of ['space-indigo', 'dark-amaranth', 'ocean-deep']) {
			for (const selector of [`:root:not(.dark)[data-accent='${palette}']`, `.dark[data-accent='${palette}']`]) {
				expect(themeCss).toContain(selector);
				const start = themeCss.indexOf(selector);
				const block = themeCss.slice(start, themeCss.indexOf('}', start));
				expect(block).toContain('--color-accent:');
				expect(block).not.toContain('--color-background:');
				expect(block).not.toContain('--color-surface:');
				expect(block).not.toContain('--color-border:');
			}
		}
	});

	it('uses a neutral light background for the main page', () => {
		expect(themeCss).toContain('--color-background: oklch(100% 0 0);');
	});
});

describe('public markup palette-free', () => {
	it('uses no slate/gray/white/black utilities in components', () => {
		for (const file of sourceFiles(join(root, 'src/components'))) {
			const content = readFileSync(file, 'utf8');
			const matches = content.match(PALETTE_UTILITY);
			expect(matches, `${file} uses hard-coded palette utilities`).toBeNull();
		}
	});

	it('uses no slate/gray/white/black utilities in layouts', () => {
		for (const file of sourceFiles(join(root, 'src/layouts'))) {
			const content = readFileSync(file, 'utf8');
			const matches = content.match(PALETTE_UTILITY);
			expect(matches, `${file} uses hard-coded palette utilities`).toBeNull();
		}
	});
});
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
		expect(themeCss).toContain('--color-background: var(--color-ocean-deep-50);');
		expect(themeCss).toContain('--color-primary: var(--color-soft-periwinkle-400);');
		expect(themeCss).toContain('--color-secondary: var(--color-ocean-deep-400);');
		expect(themeCss).toContain('--color-accent: var(--color-dark-amaranth-400);');
		expect(themeCss).toContain('--color-muted: var(--color-bright-amber-50);');
	});

	it('defines dark-mode semantic rules from COLORS.md', () => {
		expect(themeCss).toContain('--color-background: var(--color-space-indigo-700);');
		expect(themeCss).toContain('--color-primary: var(--color-soft-periwinkle-50);');
		expect(themeCss).toContain('--color-secondary: var(--color-bright-amber-100);');
		expect(themeCss).toContain('--color-accent: var(--color-dark-amaranth-100);');
		expect(themeCss).toContain('--color-muted: var(--color-bright-amber-50);');
	});

	it('defines the three assigned per-publication accent overrides', () => {
		for (const accent of ['dark-amaranth', 'bright-amber', 'soft-periwinkle']) {
			expect(themeCss).toContain(`[data-accent='${accent}']`);
		}
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
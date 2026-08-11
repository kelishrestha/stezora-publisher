import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BloggerClient } from '../../src/lib/blogger/client';
import { bloggerBlogIdForPublication, bloggerUrlForPublication } from '../../src/lib/blogger/config';
import { importPosts } from '../../src/lib/blogger/importer';
import { getPublication, getPublications } from '../../src/lib/publications';

const OUTPUT_DIR = path.join(process.cwd(), 'src/content/posts');

interface CliOptions {
	blog?: string;
	all: boolean;
	dryRun: boolean;
	limit?: number;
	includeDrafts: boolean;
	update: boolean;
}

function parseArgs(argv: string[]): CliOptions {
	const options: CliOptions = { all: false, dryRun: false, includeDrafts: false, update: false };
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		switch (arg) {
			case '--blog':
				options.blog = argv[++i];
				break;
			case '--all':
				options.all = true;
				break;
			case '--dry-run':
				options.dryRun = true;
				break;
			case '--limit':
				options.limit = Number(argv[++i]);
				break;
			case '--include-drafts':
				options.includeDrafts = true;
				break;
			case '--update':
				options.update = true;
				break;
			default:
				throw new Error(`Unknown argument: ${arg}`);
		}
	}
	if (!options.blog && !options.all) {
		throw new Error('Provide --blog <slug> or --all');
	}
	if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1)) {
		throw new Error('--limit must be a positive integer');
	}
	return options;
}

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required environment variable ${name}`);
	}
	return value;
}

async function runImport(slug: string, options: CliOptions): Promise<void> {
	const publication = getPublication(slug);
	if (!publication) {
		throw new Error(`Publication not found: ${slug}`);
	}

	const blogId = bloggerBlogIdForPublication(slug);
	const blogUrl = bloggerUrlForPublication(slug);

	const client = new BloggerClient({
		blogId,
		clientId: requireEnv('BLOGGER_CLIENT_ID'),
		clientSecret: requireEnv('BLOGGER_CLIENT_SECRET'),
		refreshToken: requireEnv('BLOGGER_REFRESH_TOKEN'),
	});

	const report = await importPosts({
		client,
		outputDir: OUTPUT_DIR,
		publicationSlug: publication.slug,
		blogId,
		includeDrafts: options.includeDrafts,
		update: options.update,
		dryRun: options.dryRun,
		limit: options.limit,
	});

	console.log(`\nImport report: ${report.publicationSlug}`);
	if (blogUrl) {
		console.log(`  source blog URL: ${blogUrl}`);
	}
	console.log(`  found:    ${report.found}`);
	console.log(`  imported: ${report.imported}`);
	console.log(`  skipped:  ${report.skipped}`);
	console.log(`  failed:   ${report.failed.length}`);
	for (const skipped of report.skippedPosts) {
		console.log(`    skip ${skipped.bloggerPostId}: ${skipped.title} (${skipped.reason})`);
	}
	for (const failed of report.failed) {
		console.log(`    fail ${failed.bloggerPostId}: ${failed.title} — ${failed.error}`);
	}
	console.log(`  images:   ${report.images.length}`);

	if (!options.dryRun && report.images.length > 0) {
		const manifest = path.join(process.cwd(), 'migration-reports', `${publication.slug}-images.json`);
		await fs.mkdir(path.dirname(manifest), { recursive: true });
		await fs.writeFile(manifest, `${JSON.stringify(report.images, null, 2)}\n`, 'utf-8');
		console.log(`\nImage inventory written to ${path.relative(process.cwd(), manifest)}`);
	}
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	const slugs = options.all ? getPublications().map((p) => p.slug) : [options.blog as string];
	const failures: string[] = [];
	for (const slug of slugs) {
		try {
			await runImport(slug, options);
		} catch (error) {
			console.error(`\nImport failed for "${slug}": ${error instanceof Error ? error.message : error}`);
			failures.push(slug);
		}
	}
	if (failures.length > 0) {
		throw new Error(`${failures.length} of ${slugs.length} publication(s) failed: ${failures.join(', ')}`);
	}
}

main().catch((error) => {
	console.error(`\nImport failed: ${error instanceof Error ? error.message : error}`);
	process.exitCode = 1;
});

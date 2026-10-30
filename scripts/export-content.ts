import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { sanitizeContentHtml } from '../src/lib/blogger/sanitize';
import { postFilename, writePost } from '../src/lib/blogger/storage';
import type { PostRecord } from '../src/lib/blogger/types';

const root = path.resolve(import.meta.dirname, '..');
const postsDir = path.join(root, 'src', 'content', 'posts');

export interface ContentPost {
	slug: string;
	title: string;
	excerpt: string;
	publication: string;
	tags: string[];
	pubDate: string;
	updatedDate?: string;
	status: 'published';
	content: string;
	seoTitle?: string;
	seoDescription?: string;
	featuredImage?: string;
	bloggerBlogId?: string;
	bloggerPostId?: string;
	bloggerUrl?: string;
	neobookUrl?: string;
	neobookViews?: number;
	neobookLikes?: number;
	neobookComments?: number;
}

export interface ContentResponse {
	publications: unknown[];
	posts: ContentPost[];
	tags: unknown[];
}

function stripJsonc(source: string): string {
	let output = '';
	let inString = false;
	let inLineComment = false;
	let inBlockComment = false;
	for (let i = 0; i < source.length; i += 1) {
		const current = source[i];
		const next = source[i + 1];
		if (inLineComment) {
			if (current === '\n') {
				inLineComment = false;
				output += current;
			}
			continue;
		}
		if (inBlockComment) {
			if (current === '*' && next === '/') {
				inBlockComment = false;
				i += 1;
			}
			continue;
		}
		if (inString) {
			output += current;
			if (current === '\\' && next !== undefined) {
				output += next;
				i += 1;
			} else if (current === '"') {
				inString = false;
			}
			continue;
		}
		if (current === '"') {
			inString = true;
			output += current;
		} else if (current === '/' && next === '/') {
			inLineComment = true;
			i += 1;
		} else if (current === '/' && next === '*') {
			inBlockComment = true;
			i += 1;
		} else {
			output += current;
		}
	}
	return output.replace(/,\s*([}\]])/g, '$1');
}

async function readWranglerConfig(): Promise<Record<string, unknown>> {
	const source = await fs.readFile(path.join(root, 'wrangler.jsonc'), 'utf-8');
	return JSON.parse(stripJsonc(source)) as Record<string, unknown>;
}

interface D1BindingConfig {
	binding: string;
	database_id?: string;
	preview_database_id?: string;
}

interface R2BindingConfig {
	binding: string;
	bucket_name: string;
}

async function bundleWorker(): Promise<string> {
	const result = await build({
		entryPoints: [path.join(root, 'worker', 'index.ts')],
		bundle: true,
		format: 'esm',
		platform: 'browser',
		target: 'es2022',
		write: false,
		logLevel: 'silent',
	});
	return patchBundleForMiniflare(result.outputFiles[0].text);
}

/**
 * BetterAuth pulls in a Kysely adapter whose dead node:sqlite probe emits a
 * non-literal `import(nodeSqlite)`. Miniflare's module locator rejects
 * non-literal dynamic-import specifiers at build time (workerd tolerates them
 * in dead code), which breaks the local Miniflare harness used here. The
 * branch is never reached for a D1 binding (`db instanceof DatabaseSync` is
 * false), so neutralize the import while keeping `DatabaseSync` undefined.
 */
export function patchBundleForMiniflare(code: string): string {
	const pattern =
		/\{ ?DatabaseSync ?\} = await import\(\s*\/\* @vite-ignore \*\/\s*\/\* webpackIgnore: true \*\/\s*nodeSqlite\s*\)/;
	if (!pattern.test(code)) {
		throw new Error('Expected the better-auth Kysely node:sqlite import to be present in the worker bundle.');
	}
	return code.replace(pattern, '{ DatabaseSync } = void 0');
}

async function fetchLocalContent(): Promise<ContentResponse> {
	const config = await readWranglerConfig();
	const d1 = (config.d1_databases as D1BindingConfig[] | undefined)?.[0];
	if (!d1) {
		throw new Error('No d1_databases binding found in wrangler.jsonc');
	}
	const databaseId = d1.preview_database_id ?? d1.database_id ?? d1.binding;
	const r2 = (config.r2_buckets as R2BindingConfig[] | undefined)?.[0];

	const mf = new Miniflare({
		script: await bundleWorker(),
		modules: true,
		compatibilityDate: typeof config.compatibility_date === 'string' ? config.compatibility_date : undefined,
		compatibilityFlags: ['nodejs_compat'],
		d1Databases: { [d1.binding]: databaseId },
		r2Buckets: r2 ? { [r2.binding]: r2.bucket_name } : undefined,
		bindings: (config.vars as Record<string, string> | undefined) ?? {},
		resourcePersistencePath: path.join(root, '.wrangler', 'state', 'v3'),
	});
	try {
		const worker = await mf.getWorker();
		const response = await worker.fetch('http://localhost/api/content');
		if (!response.ok) {
			throw new Error(`GET /api/content failed with status ${response.status}`);
		}
		return (await response.json()) as ContentResponse;
	} finally {
		await mf.dispose();
	}
}

async function fetchRemoteContent(url: string): Promise<ContentResponse> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`GET ${url} failed with status ${response.status}`);
	}
	return (await response.json()) as ContentResponse;
}

interface ExportRecord {
	title: string;
	excerpt: string;
	publication: string;
	tags: string[];
	pubDate: string;
	updatedDate?: string;
	status: 'published';
	content: string;
	seoTitle?: string;
	seoDescription?: string;
	featuredImage?: string;
	bloggerBlogId?: string;
	bloggerPostId?: string;
	bloggerUrl?: string;
	neobookUrl?: string;
	neobookViews?: number;
	neobookLikes?: number;
	neobookComments?: number;
}

function toPostRecord(post: ContentPost): PostRecord {
	const record: ExportRecord = {
		title: post.title,
		excerpt: post.excerpt,
		publication: post.publication,
		tags: post.tags,
		pubDate: post.pubDate,
		status: 'published',
		content: sanitizeContentHtml(post.content),
		bloggerPostId: post.bloggerPostId || undefined,
		bloggerUrl: post.bloggerUrl || undefined,
	};
	if (post.seoTitle) {
		record.seoTitle = post.seoTitle;
	}
	if (post.seoDescription) {
		record.seoDescription = post.seoDescription;
	}
	if (post.featuredImage) {
		record.featuredImage = post.featuredImage;
	}
	if (post.bloggerBlogId) {
		record.bloggerBlogId = post.bloggerBlogId;
	}
	if (post.updatedDate) {
		record.updatedDate = post.updatedDate;
	}
	if (post.neobookUrl) {
		record.neobookUrl = post.neobookUrl;
	}
	if (post.neobookViews) {
		record.neobookViews = post.neobookViews;
	}
	if (post.neobookLikes) {
		record.neobookLikes = post.neobookLikes;
	}
	if (post.neobookComments) {
		record.neobookComments = post.neobookComments;
	}
	return record as PostRecord;
}

export interface WriteExportOptions {
	/**
	 * Allow writing an empty export even when `src/content/posts/` is empty.
	 * Without this, a zero-post export fails so an unseeded/empty D1 (or a
	 * broken remote endpoint) can never silently produce an empty site.
	 */
	allowEmpty?: boolean;
	/**
	 * Download external post images into a static directory and rewrite the
	 * featuredImage to a local path. Production has no R2, so images must ship
	 * as build assets instead of being hotlinked from Blogger/Neobook. Off by
	 * default (and in tests) so writeExport stays network-free unless asked.
	 */
	localizeImages?: boolean;
	/** Directory for localized images (served at /localized). Defaults to public/localized. */
	imageDir?: string;
}

const EXT_BY_TYPE: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'image/avif': 'avif',
};

/**
 * Downloads one external image into `imageDir` (deduped by URL hash) and returns
 * its `/localized/<name>` path. On any failure the original URL is returned so a
 * missing image never breaks the export.
 */
async function localizeImage(url: string, imageDir: string, cache: Map<string, string>): Promise<string> {
	if (!/^https?:\/\//i.test(url)) {
		return url;
	}
	const cached = cache.get(url);
	if (cached) {
		return cached;
	}
	try {
		const response = await fetch(url);
		if (!response.ok) {
			return url;
		}
		const ext = EXT_BY_TYPE[(response.headers.get('content-type') ?? '').split(';')[0].trim()] ?? 'jpg';
		const name = `${createHash('sha256').update(url).digest('hex').slice(0, 16)}.${ext}`;
		await fs.mkdir(imageDir, { recursive: true });
		const file = path.join(imageDir, name);
		const localPath = `/localized/${name}`;
		const bytes = new Uint8Array(await response.arrayBuffer());
		await fs.writeFile(file, bytes);
		cache.set(url, localPath);
		return localPath;
	} catch {
		return url;
	}
}

export async function writeExport(dir: string, data: ContentResponse, options: WriteExportOptions = {}): Promise<void> {
	if (!Array.isArray(data.posts)) {
		throw new Error('Invalid content response: expected a posts array');
	}

	const existing = await fs.readdir(dir).catch(() => [] as string[]);
	const existingJson = existing.filter((file) => file.endsWith('.json'));

	if (data.posts.length === 0) {
		if (existingJson.length > 0) {
			throw new Error(
				'Refusing to delete existing content: the export returned 0 posts but the content directory is not empty. ' +
					'Run pnpm db:migrate && pnpm db:seed && pnpm db:backfill first, or set EXPORT_CONTENT_URL to a live endpoint.'
			);
		}
		if (!options.allowEmpty) {
			throw new Error(
				'The export returned 0 posts and the content directory is empty. ' +
					'An empty site is a deployment failure: seed the D1 database (pnpm db:migrate && pnpm db:seed && pnpm db:backfill) ' +
					'or set EXPORT_CONTENT_URL to a live endpoint. If you genuinely have no posts yet, set EXPORT_CONTENT_ALLOW_EMPTY=1.'
			);
		}
	}

	const imageDir = options.imageDir ?? path.join(root, 'public', 'localized');
	const imageCache = new Map<string, string>();

	const expectedFiles = new Set<string>();
	for (const post of data.posts) {
		const filename = postFilename(post.publication, post.slug);
		expectedFiles.add(filename);
		const record = toPostRecord(post);
		if (options.localizeImages && record.featuredImage) {
			record.featuredImage = await localizeImage(record.featuredImage, imageDir, imageCache);
		}
		await writePost(dir, post.publication, post.slug, record);
	}

	for (const file of existing) {
		if (file.endsWith('.json') && !expectedFiles.has(file)) {
			await fs.unlink(path.join(dir, file));
		}
	}
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	let mode: 'local' | 'remote' = 'local';
	let url = process.env.EXPORT_CONTENT_URL;

	for (let i = 0; i < args.length; i += 1) {
		if (args[i] === '--local') {
			mode = 'local';
		} else if (args[i] === '--remote') {
			mode = 'remote';
			url = args[i + 1];
			i += 1;
		}
	}
	if (url) {
		mode = 'remote';
	}

	let data: ContentResponse;
	if (mode === 'remote') {
		if (!url) {
			throw new Error('Remote mode requires a URL: export:content --remote <url> or EXPORT_CONTENT_URL');
		}
		console.error(`export:content: fetching ${url}`);
		data = await fetchRemoteContent(url);
	} else {
		console.error('export:content: reading local D1 via Miniflare');
		data = await fetchLocalContent();
	}

	await writeExport(postsDir, data, {
		allowEmpty: process.env.EXPORT_CONTENT_ALLOW_EMPTY === '1',
		// Production has no R2, so ship images as static build assets.
		localizeImages: process.env.EXPORT_SKIP_IMAGE_LOCALIZE !== '1',
	});
	console.error(`export:content: wrote ${data.posts.length} post(s) to src/content/posts`);
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMain) {
	await main();
}

import type { BloggerClient } from './client';
import { extractImageUrls, sanitizeBloggerHtml } from './html';
import { makeUniqueSlug, mapPost } from './mapper';
import { ImportReporter } from './reporter';
import { readExistingPosts, writePost } from './storage';
import type { ImportReport, PostRecord } from './types';

export interface ImportOptions {
	client: BloggerClient;
	outputDir: string;
	publicationSlug: string;
	blogId: string;
	includeDrafts?: boolean;
	update?: boolean;
	dryRun?: boolean;
	limit?: number;
}

export async function importPosts(options: ImportOptions): Promise<ImportReport> {
	const { client, outputDir, publicationSlug, blogId, includeDrafts, update, dryRun, limit } = options;

	const reporter = new ImportReporter(publicationSlug, blogId);
	const existing = await readExistingPosts(outputDir);
	const usedSlugs = new Set<string>();

	for (const filePath of existing.byFile.keys()) {
		const record = existing.byFile.get(filePath);
		if (record && record.publication === publicationSlug) {
			const slug = postSlugFromFile(filePath, publicationSlug);
			if (slug) {
				usedSlugs.add(slug);
			}
		}
	}

	let count = 0;

	for await (const dto of client.fetchAllPosts({ status: includeDrafts ? 'live,draft' : 'live' })) {
		if (limit && count >= limit) {
			break;
		}
		reporter.recordFound();
		count += 1;

		const existingPath = existing.byBloggerPostId.get(dto.id);
		if (existingPath && !update) {
			reporter.recordSkipped(dto, 'already imported (bloggerPostId match)');
			continue;
		}

		try {
			const mapped = mapPost(dto, { publicationSlug, includeDrafts });
			const record: PostRecord = {
				...mapped.record,
				content: sanitizeBloggerHtml(mapped.record.content, { normalizeProtocolRelativeUrls: true }),
			};

			const postSlug = existingPath
				? postSlugFromFile(existingPath, publicationSlug)
				: makeUniqueSlug(mapped.baseSlug, usedSlugs);
			usedSlugs.add(postSlug);

			if (dryRun) {
				reporter.recordImported(extractImageUrls(record.content));
				continue;
			}

			await writePost(outputDir, publicationSlug, postSlug, record);
			reporter.recordImported(extractImageUrls(record.content));
		} catch (error) {
			reporter.recordFailed(dto, error);
		}
	}

	return reporter.summary;
}

function deriveFileSlug(filePath: string): string {
	const filename = filePath.split('/').at(-1) ?? '';
	return filename.replace(/\.json$/, '');
}

function postSlugFromFile(filePath: string, publicationSlug: string): string {
	const stem = deriveFileSlug(filePath);
	const prefix = `${publicationSlug}-`;
	return stem.startsWith(prefix) ? stem.slice(prefix.length) : stem;
}

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PostRecord } from './types';

export interface ExistingPosts {
	byBloggerPostId: Map<string, string>;
	byPublicationPostId: Map<string, string>;
	byBloggerIdentity: Map<string, string>;
	byFile: Map<string, PostRecord>;
}

export async function readExistingPosts(dir: string): Promise<ExistingPosts> {
	const byBloggerPostId = new Map<string, string>();
	const byPublicationPostId = new Map<string, string>();
	const byBloggerIdentity = new Map<string, string>();
	const byFile = new Map<string, PostRecord>();

	let files: string[] = [];
	try {
		files = await fs.readdir(dir);
	} catch {
		return { byBloggerPostId, byPublicationPostId, byBloggerIdentity, byFile };
	}

	for (const file of files) {
		if (!file.endsWith('.json')) {
			continue;
		}
		const filePath = path.join(dir, file);
		try {
			const raw = await fs.readFile(filePath, 'utf-8');
			const record = JSON.parse(raw) as PostRecord;
			byFile.set(filePath, record);
			if (record.bloggerPostId) {
				byBloggerPostId.set(record.bloggerPostId, filePath);
				byPublicationPostId.set(`${record.publication}:${record.bloggerPostId}`, filePath);
			}
			if (record.bloggerBlogId && record.bloggerPostId) {
				byBloggerIdentity.set(`${record.bloggerBlogId}:${record.bloggerPostId}`, filePath);
			}
		} catch (error) {
			console.warn(`Skipping unreadable post file ${file}: ${error instanceof Error ? error.message : error}`);
		}
	}

	return { byBloggerPostId, byPublicationPostId, byBloggerIdentity, byFile };
}

const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/;

function assertSafeSlug(value: string, label: string): void {
	if (!SAFE_SLUG.test(value)) {
		throw new Error(`Invalid ${label} "${value}": slugs must match [a-z0-9-]`);
	}
}

export function postFilename(publicationSlug: string, postSlug: string): string {
	assertSafeSlug(publicationSlug, 'publication slug');
	assertSafeSlug(postSlug, 'post slug');
	return `${publicationSlug}-${postSlug}.json`;
}

export async function writePost(dir: string, publicationSlug: string, postSlug: string, record: PostRecord): Promise<string> {
	await fs.mkdir(dir, { recursive: true });
	const filePath = path.join(dir, postFilename(publicationSlug, postSlug));
	await fs.writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, 'utf-8');
	return filePath;
}

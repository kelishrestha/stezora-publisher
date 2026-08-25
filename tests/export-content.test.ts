import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeExport } from '../scripts/export-content';
import type { ContentResponse } from '../scripts/export-content';

const tmpDirs: string[] = [];

async function makeTmpDir(): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'export-content-'));
	tmpDirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(
		tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }))
	);
});

function fixtureResponse(): ContentResponse {
	return {
		publications: [{ id: 'pub-a', name: 'Pub A', slug: 'pub-a', description: 'Desc' }],
		tags: [],
		posts: [
			{
				slug: 'hello-world',
				title: 'Hello World',
				excerpt: 'An excerpt',
				publication: 'pub-a',
				tags: ['poetry'],
				pubDate: '2026-01-01T00:00:00.000Z',
				updatedDate: '2026-01-02T00:00:00.000Z',
				status: 'published',
				content: '<p>body</p>',
				seoTitle: 'Search title',
				seoDescription: 'Search description',
				bloggerPostId: '123',
				bloggerUrl: 'https://example.com/hello.html',
			},
			{
				slug: 'no-blogger',
				title: 'No Blogger',
				excerpt: 'Another excerpt',
				publication: 'pub-a',
				tags: [],
				pubDate: '2026-02-01T00:00:00.000Z',
				status: 'published',
				content: '<p>body 2</p>',
			},
		],
	};
}

describe('export-content writeExport', () => {
	it('writes one file per post with the <publication>-<slug>.json convention', async () => {
		const dir = await makeTmpDir();
		await writeExport(dir, fixtureResponse());

		const files = (await fs.readdir(dir)).sort();
		expect(files).toEqual(['pub-a-hello-world.json', 'pub-a-no-blogger.json']);

		const withBlogger = JSON.parse(
			await fs.readFile(path.join(dir, 'pub-a-hello-world.json'), 'utf-8')
		);
		expect(withBlogger).toEqual({
			title: 'Hello World',
			excerpt: 'An excerpt',
			publication: 'pub-a',
			tags: ['poetry'],
			pubDate: '2026-01-01T00:00:00.000Z',
			updatedDate: '2026-01-02T00:00:00.000Z',
			status: 'published',
			content: '<p>body</p>',
			seoTitle: 'Search title',
			seoDescription: 'Search description',
			bloggerPostId: '123',
			bloggerUrl: 'https://example.com/hello.html',
		});

		const noBlogger = JSON.parse(
			await fs.readFile(path.join(dir, 'pub-a-no-blogger.json'), 'utf-8')
		);
		expect(noBlogger).toEqual({
			title: 'No Blogger',
			excerpt: 'Another excerpt',
			publication: 'pub-a',
			tags: [],
			pubDate: '2026-02-01T00:00:00.000Z',
			status: 'published',
			content: '<p>body 2</p>',
		});
		expect(noBlogger.bloggerPostId).toBeUndefined();
		expect(noBlogger.bloggerUrl).toBeUndefined();
	});

	it('is idempotent: two runs produce identical files', async () => {
		const dir = await makeTmpDir();
		await writeExport(dir, fixtureResponse());
		const first = await fs.readFile(path.join(dir, 'pub-a-hello-world.json'), 'utf-8');

		await writeExport(dir, fixtureResponse());
		const second = await fs.readFile(path.join(dir, 'pub-a-hello-world.json'), 'utf-8');

		expect(second).toBe(first);
		expect((await fs.readdir(dir)).sort()).toEqual([
			'pub-a-hello-world.json',
			'pub-a-no-blogger.json',
		]);
	});

	it('removes stale JSON files no longer present in the export', async () => {
		const dir = await makeTmpDir();
		await fs.writeFile(path.join(dir, 'pub-a-old-draft.json'), '{}', 'utf-8');
		await fs.writeFile(path.join(dir, 'not-a-post.txt'), 'keep me', 'utf-8');

		await writeExport(dir, fixtureResponse());

		const files = (await fs.readdir(dir)).sort();
		expect(files).toEqual(['not-a-post.txt', 'pub-a-hello-world.json', 'pub-a-no-blogger.json']);
	});

	it('rejects a response without a posts array', async () => {
		const dir = await makeTmpDir();
		await expect(
			writeExport(dir, { publications: [], posts: undefined as never, tags: [] })
		).rejects.toThrow('expected a posts array');
	});

	it('refuses to delete existing content when the export returns no posts', async () => {
		const dir = await makeTmpDir();
		await writeExport(dir, fixtureResponse());
		await expect(
			writeExport(dir, { publications: [], posts: [], tags: [] })
		).rejects.toThrow(/Refusing to delete existing content/);
		expect((await fs.readdir(dir)).sort()).toEqual([
			'pub-a-hello-world.json',
			'pub-a-no-blogger.json',
		]);
	});

	it('fails on an empty export into an empty directory unless allowEmpty is set', async () => {
		const dir = await makeTmpDir();
		const empty = { publications: [], posts: [], tags: [] };

		await expect(writeExport(dir, empty)).rejects.toThrow(/An empty site is a deployment failure/);
		expect(await fs.readdir(dir)).toEqual([]);

		await writeExport(dir, empty, { allowEmpty: true });
		expect(await fs.readdir(dir)).toEqual([]);
	});

	it('sanitizes post content before writing the exported JSON', async () => {
		const dir = await makeTmpDir();
		const response = fixtureResponse();
		response.posts[0].content =
			'<p>hello</p><script>alert(1)</script><img src="javascript:alert(2)" onerror="alert(3)">';
		await writeExport(dir, response);

		const exported = JSON.parse(
			await fs.readFile(path.join(dir, 'pub-a-hello-world.json'), 'utf-8')
		);
		expect(exported.content).toContain('<p>hello</p>');
		expect(exported.content).not.toContain('<script>');
		expect(exported.content).not.toContain('onerror');
		expect(exported.content).not.toContain('javascript:');
	});

	it('rejects posts whose slug could escape the content directory', async () => {
		const dir = await makeTmpDir();
		const response = fixtureResponse();
		response.posts[0].slug = '../../evil';
		await expect(writeExport(dir, response)).rejects.toThrow(/Invalid post slug/);
		expect(await fs.readdir(dir)).toEqual([]);
	});

	it('rejects posts whose publication could escape the content directory', async () => {
		const dir = await makeTmpDir();
		const response = fixtureResponse();
		response.posts[0].publication = '..';
		await expect(writeExport(dir, response)).rejects.toThrow(/Invalid publication slug/);
		expect(await fs.readdir(dir)).toEqual([]);
	});

	it('writes an empty directory when the export has no posts and allowEmpty is set', async () => {
		const dir = await makeTmpDir();
		await writeExport(dir, { publications: [], posts: [], tags: [] }, { allowEmpty: true });
		expect(await fs.readdir(dir)).toEqual([]);
	});
});

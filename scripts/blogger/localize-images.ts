import { pathToFileURL } from 'node:url';
import { buildLocalWorker } from '../backup/local-worker';

/**
 * Localizes Blogger-hosted media into R2: for every external media row, the
 * Worker downloads the image, stores it in R2, fixes the row's mime/size, and
 * rewrites the owning post's content to /media/<key>. Runs against local D1
 * and R2 via Miniflare; signs in with the admin credentials from
 * .env.development (same as the CMS).
 *
 * Usage: pnpm blogger:localize
 * After a local run: pnpm export:content && pnpm build.
 */

interface MediaItem {
	id: string;
	filename: string;
	external?: boolean;
}

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required environment variable ${name}`);
	}
	return value;
}

async function main(): Promise<void> {
	const { worker, dispose } = await buildLocalWorker();
	try {
		const signIn = await worker.fetch('http://localhost/api/auth/sign-in/email', {
			method: 'POST',
			headers: { 'content-type': 'application/json', origin: 'http://localhost' },
			body: JSON.stringify({ email: requireEnv('ADMIN_EMAIL'), password: requireEnv('ADMIN_INITIAL_PASSWORD') }),
		});
		const cookie = signIn.headers.get('set-cookie')?.split(';')[0];
		if (!signIn.ok || !cookie) {
			throw new Error(`Admin sign-in failed (${signIn.status}); run pnpm db:seed first.`);
		}

		const all: MediaItem[] = [];
		for (let offset = 0; ; offset += 100) {
			const page = await worker.fetch(`http://localhost/api/admin/media?limit=100&offset=${offset}`, {
				headers: { cookie },
			});
			if (!page.ok) throw new Error(`Listing media failed (${page.status}).`);
			const body = (await page.json()) as { data: { media: MediaItem[] } };
			all.push(...body.data.media);
			if (body.data.media.length < 100) break;
		}
		const external = all.filter((item) => item.external);
		console.error(`localize: ${external.length} external of ${all.length} media rows`);

		let done = 0;
		const failures: string[] = [];
		for (const item of external) {
			const response = await worker.fetch(`http://localhost/api/admin/media/${item.id}/localize`, {
				method: 'POST',
				headers: { cookie },
			});
			if (response.ok) {
				done += 1;
				console.error(`  ok   ${item.id}`);
			} else {
				failures.push(item.id);
				console.error(`  FAIL ${item.id} (${response.status}): ${(await response.text()).slice(0, 120)}`);
			}
		}
		console.error(`localize: ${done} localized, ${failures.length} failed`);
		if (failures.length > 0) {
			process.exitCode = 1;
		}
	} finally {
		await dispose();
	}
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMain) {
	await main();
}

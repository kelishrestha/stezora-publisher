import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import worker from '../../worker/index';

const db = env.DB;

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'correct-horse-battery-staple';
const ADMIN_HASH =
	'ce018f62e94bb4691067bb9dcd0619af:25c1257d17e89a1312174042b05759811aca8c66a1fcbbb05c87d41b4df1936f8be05b155c4fb30387a417cef6820e3217fd8650d1bbbb592f613cb0e4b0adde';
const UA = 'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

async function fetchWorker(path: string, init?: RequestInit): Promise<Response> {
	const ctx = createExecutionContext();
	const response = await worker.fetch(new Request(`http://localhost${path}`, init), env, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

async function signInAndCookies(): Promise<string> {
	const response = await fetchWorker('/api/auth/sign-in/email', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
	});
	return response.headers.get('set-cookie')?.split(';')[0] ?? '';
}

async function putSettings(cookie: string, patch: Record<string, unknown>): Promise<Response> {
	return fetchWorker('/api/admin/settings', {
		method: 'PUT',
		headers: { 'content-type': 'application/json', cookie },
		body: JSON.stringify(patch),
	});
}

async function collect(consent = 'unset'): Promise<Response> {
	return fetchWorker('/api/collect', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'user-agent': UA, 'cf-connecting-ip': '198.51.100.7' },
		body: JSON.stringify({ p: '/', r: '', consent }),
	});
}

async function pageViewCount(): Promise<number> {
	return (await db.prepare('SELECT COUNT(*) AS n FROM page_views').first<{ n: number }>())?.n ?? 0;
}

describe('app settings', () => {
	beforeAll(async () => {
		const now = new Date().toISOString();
		await db
			.prepare('INSERT OR IGNORE INTO user (id, name, email, email_verified, image, created_at, updated_at, role) VALUES (?, ?, ?, 0, NULL, ?, ?, ?)')
			.bind('usr-admin', 'Site Admin', ADMIN_EMAIL, now, now, 'admin')
			.run();
		await db
			.prepare('INSERT OR IGNORE INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
			.bind('acc-admin', 'usr-admin', 'credential', 'usr-admin', ADMIN_HASH, now, now)
			.run();
	});

	it('requires auth for settings', async () => {
		expect((await fetchWorker('/api/admin/settings')).status).toBe(401);
	});

	it('returns defaults and persists updates', async () => {
		const cookie = await signInAndCookies();
		const get = (await (await fetchWorker('/api/admin/settings', { headers: { cookie } })).json()) as { data: { settings: Record<string, unknown> } };
		expect(get.data.settings).toMatchObject({ analyticsEnabled: true, consentMode: 'opt-out', retentionDays: 90, timezone: 'Asia/Kathmandu', mediaStorageEnabled: true });

		const put = (await (await putSettings(cookie, { analyticsEnabled: true, consentMode: 'opt-in', retentionDays: 30, mediaStorageEnabled: false })).json()) as {
			data: { settings: Record<string, unknown> };
		};
		expect(put.data.settings).toMatchObject({ consentMode: 'opt-in', retentionDays: 30, mediaStorageEnabled: false });
	});

	it('persists a valid timezone and rejects an invalid one', async () => {
		const cookie = await signInAndCookies();
		const ok = await putSettings(cookie, { timezone: 'Europe/London' });
		expect(ok.status).toBe(200);
		expect(((await ok.json()) as { data: { settings: { timezone: string } } }).data.settings.timezone).toBe('Europe/London');

		const bad = await putSettings(cookie, { timezone: 'Not/AZone' });
		expect(bad.status).not.toBe(200);
	});

	it('records no pageviews while analytics is disabled', async () => {
		const cookie = await signInAndCookies();
		await putSettings(cookie, { analyticsEnabled: false });
		const before = await pageViewCount();
		expect((await collect('granted')).status).toBe(204);
		expect(await pageViewCount()).toBe(before);

		// Re-enable and confirm collection resumes.
		await putSettings(cookie, { analyticsEnabled: true });
		await collect('granted');
		expect(await pageViewCount()).toBe(before + 1);
	});

	it('honors opt-in consent mode: no cookie until granted', async () => {
		const cookie = await signInAndCookies();
		await putSettings(cookie, { analyticsEnabled: true, consentMode: 'opt-in' });
		expect((await collect('unset')).headers.get('set-cookie')).toBeNull();
		expect((await collect('granted')).headers.get('set-cookie')).toContain('sv_id=');
	});

	it('exports analytics data as a backup', async () => {
		const cookie = await signInAndCookies();
		await putSettings(cookie, { analyticsEnabled: true });
		await collect('granted');
		const response = await fetchWorker('/api/admin/analytics/export', { headers: { cookie } });
		expect(response.status).toBe(200);
		const body = (await response.json()) as { data: { schema: string; count: number; pageViews: unknown[] } };
		expect(body.data.schema).toBe('stezora-analytics/1');
		expect(body.data.count).toBeGreaterThanOrEqual(1);
		expect(Array.isArray(body.data.pageViews)).toBe(true);
	});

	it('requires auth for the analytics export', async () => {
		expect((await fetchWorker('/api/admin/analytics/export')).status).toBe(401);
	});

	it('clears all analytics data', async () => {
		const cookie = await signInAndCookies();
		await putSettings(cookie, { analyticsEnabled: true });
		await collect('granted');
		expect(await pageViewCount()).toBeGreaterThan(0);

		const response = await fetchWorker('/api/admin/analytics/clear', {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie },
			body: JSON.stringify({ scope: 'all' }),
		});
		expect(response.status).toBe(200);
		expect(await pageViewCount()).toBe(0);
	});
});

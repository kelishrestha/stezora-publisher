import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import worker from '../../worker/index';

const db = env.DB;

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'correct-horse-battery-staple';
const NEW_PASSWORD = 'an-even-better-passphrase';
const ADMIN_HASH =
	'ce018f62e94bb4691067bb9dcd0619af:25c1257d17e89a1312174042b05759811aca8c66a1fcbbb05c87d41b4df1936f8be05b155c4fb30387a417cef6820e3217fd8650d1bbbb592f613cb0e4b0adde';

async function fetchWorker(path: string, init?: RequestInit): Promise<Response> {
	const ctx = createExecutionContext();
	const response = await worker.fetch(new Request(`http://localhost${path}`, init), env, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

async function signIn(password: string): Promise<Response> {
	return fetchWorker('/api/auth/sign-in/email', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email: ADMIN_EMAIL, password }),
	});
}

describe('change password', () => {
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

	it('changes the password and rotates which password is valid', async () => {
		const login = await signIn(ADMIN_PASSWORD);
		const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';

		const change = await fetchWorker('/api/auth/change-password', {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie, origin: 'http://localhost' },
			body: JSON.stringify({ currentPassword: ADMIN_PASSWORD, newPassword: NEW_PASSWORD, revokeOtherSessions: false }),
		});
		expect(change.status).toBe(200);

		expect((await signIn(NEW_PASSWORD)).status).toBe(200);
		expect((await signIn(ADMIN_PASSWORD)).status).toBe(401);
	});

	it('rejects a change with the wrong current password', async () => {
		const login = await signIn(NEW_PASSWORD);
		const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';

		const change = await fetchWorker('/api/auth/change-password', {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie, origin: 'http://localhost' },
			body: JSON.stringify({ currentPassword: 'not-the-password', newPassword: 'irrelevant-passphrase', revokeOtherSessions: false }),
		});
		expect(change.status).not.toBe(200);
	});
});

import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import worker from '../../worker/index';

const db = env.DB;

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'correct-horse-battery-staple';
// Precomputed BetterAuth scrypt hash for ADMIN_EMAIL / ADMIN_PASSWORD
// (salt derived from the email; matches scripts/db/password.ts).
const ADMIN_HASH =
	'ce018f62e94bb4691067bb9dcd0619af:25c1257d17e89a1312174042b05759811aca8c66a1fcbbb05c87d41b4df1936f8be05b155c4fb30387a417cef6820e3217fd8650d1bbbb592f613cb0e4b0adde';

async function fetchWorker(path: string, init?: RequestInit): Promise<Response> {
	const ctx = createExecutionContext();
	const request = new Request(`http://localhost${path}`, init);
	const response = await worker.fetch(request, env, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

async function seedAdminUser(): Promise<void> {
	const now = new Date().toISOString();
	await db
		.prepare(
			'INSERT OR IGNORE INTO user (id, name, email, email_verified, image, created_at, updated_at, role) VALUES (?, ?, ?, 0, NULL, ?, ?, ?)'
		)
		.bind('usr-admin', 'Site Admin', ADMIN_EMAIL, now, now, 'admin')
		.run();
	await db
		.prepare(
			'INSERT OR IGNORE INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
		)
		.bind('acc-admin', 'usr-admin', 'credential', 'usr-admin', ADMIN_HASH, now, now)
		.run();
}

async function signIn(email: string, password: string): Promise<Response> {
	return fetchWorker('/api/auth/sign-in/email', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email, password }),
	});
}

function sessionCookie(response: Response): string {
	const setCookie = response.headers.get('set-cookie');
	if (!setCookie) {
		throw new Error('sign-in did not set a session cookie');
	}
	return setCookie.split(';')[0];
}

describe('admin authentication', () => {
	beforeAll(async () => {
		await seedAdminUser();
	});

	it('signs in with the seeded admin credentials', async () => {
		const response = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD);

		expect(response.status).toBe(200);
		expect(response.headers.get('set-cookie')).toContain('better-auth.session_token');
	});

	it('returns an identical 401 for a wrong email and a wrong password', async () => {
		const wrongEmail = await signIn('other@example.com', ADMIN_PASSWORD);
		const wrongPassword = await signIn(ADMIN_EMAIL, 'not-the-password');

		expect(wrongEmail.status).toBe(401);
		expect(wrongPassword.status).toBe(401);

		const emailBody = (await wrongEmail.json()) as { message?: string };
		const passwordBody = (await wrongPassword.json()) as { message?: string };
		expect(emailBody.message).toBe('Invalid email or password');
		expect(emailBody.message).toBe(passwordBody.message);
	});

	it('keeps BETTER_AUTH_SECRET out of auth responses', async () => {
		const response = await signIn('other@example.com', 'nope');

		expect(await response.text()).not.toContain(env.BETTER_AUTH_SECRET);
	});

	it('rejects protected API routes without a session', async () => {
		const response = await fetchWorker('/api/admin/stats');

		expect(response.status).toBe(401);
		const body = (await response.json()) as { success?: boolean; error?: { code?: string } };
		expect(body.success).toBe(false);
		expect(body.error?.code).toBe('UNAUTHORIZED');
	});

	it('does not allow public account registration', async () => {
		const response = await fetchWorker('/api/auth/sign-up/email', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				name: 'Unauthorized',
				email: 'unauthorized@example.com',
				password: 'correct-horse-battery-staple',
			}),
		});

		expect(response.status).not.toBe(200);
	});

	it('returns 401 from /api/admin/stats with an invalid session cookie', async () => {
		const response = await fetchWorker('/api/admin/stats', {
			headers: { cookie: 'better-auth.session_token=forged-token' },
		});

		expect(response.status).toBe(401);
	});

	it('redirects /admin and /admin/ to the login page without a session', async () => {
		const admin = await fetchWorker('/admin');
		const adminSlash = await fetchWorker('/admin/');

		expect(admin.status).toBe(302);
		expect(admin.headers.get('location')).toBe('http://localhost/admin/login');

		expect(adminSlash.status).toBe(302);
		expect(adminSlash.headers.get('location')).toBe('http://localhost/admin/login');
	});

	it('sign-out invalidates the session', async () => {
		const login = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
		const cookie = sessionCookie(login);

		const signOut = await fetchWorker('/api/auth/sign-out', {
			method: 'POST',
			headers: { cookie, origin: 'http://localhost' },
		});
		expect(signOut.status).toBe(200);

		const stats = await fetchWorker('/api/admin/stats', { headers: { cookie } });
		expect(stats.status).toBe(401);
	});

	it('rate limits repeated failed sign-in attempts', async () => {
		const attempts: number[] = [];
		let limited: Response | undefined;
		for (let i = 0; i < 60; i += 1) {
			const response = await signIn(ADMIN_EMAIL, 'brute-force-guess');
			attempts.push(response.status);
			if (response.status === 429) {
				limited = response;
				break;
			}
		}

		expect(limited).toBeDefined();
		const limitedAt = attempts.findIndex((status) => status === 429);
		expect(limitedAt).toBeGreaterThan(0);
		expect(attempts.slice(0, limitedAt).every((status) => status === 401)).toBe(true);
		expect(limited!.headers.get('x-retry-after')).toBeTruthy();

		const repeat = await signIn(ADMIN_EMAIL, 'brute-force-guess');
		expect(repeat.status).toBe(429);
	});
});
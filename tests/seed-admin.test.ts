import { describe, expect, it } from 'vitest';
import { buildAdminSeedSql } from '../scripts/db/seed-admin';
import { adminSaltForEmail, hashAdminPassword, verifyPassword } from '../scripts/db/password';

const input = {
	userId: 'usr-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
	accountId: 'acc-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
	email: 'admin@example.com',
	passwordHash: 'aabbccdd:deadbeef',
	nowMs: 1706745600000,
};

describe('buildAdminSeedSql', () => {
	it('creates exactly one admin user in the BetterAuth user table', () => {
		const sql = buildAdminSeedSql(input);

		expect(sql).toContain(
			'INSERT INTO user (id, name, email, email_verified, image, created_at, updated_at, role)'
		);
		expect(sql).toContain("'usr-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'");
		expect(sql).toContain("'Site Admin'");
		expect(sql).toContain("'admin@example.com'");
		expect(sql).toContain("'admin'");
		expect(sql).not.toContain("'hunter2'");
		expect(sql).toMatch(/INSERT INTO user[\s\S]+ON CONFLICT \(email\) DO UPDATE SET name = excluded\.name, role = excluded\.role;/);
	});

	it('stores the password on the credential account, not on the user row', () => {
		const sql = buildAdminSeedSql(input);
		const [userStatement, accountStatement] = sql.split('\n\n');

		expect(userStatement).not.toContain('password');
		expect(userStatement).toContain(
			'INSERT INTO user (id, name, email, email_verified, image, created_at, updated_at, role)'
		);
		expect(accountStatement).toContain(
			'INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)'
		);
		expect(accountStatement).toContain(
			`SELECT 'acc-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', u.id, 'credential', u.id, 'aabbccdd:deadbeef', 1706745600000, 1706745600000`
		);
		expect(accountStatement).toContain("FROM user u WHERE u.email = 'admin@example.com'");
	});

	it('only rewrites the password on conflict when the stored hash differs', () => {
		const sql = buildAdminSeedSql(input);

		expect(sql).toContain('ON CONFLICT (id) DO UPDATE SET password = excluded.password');
		expect(sql).toContain('WHERE account.password != excluded.password;');
	});

	it('produces an identical hash for the same email and password', async () => {
		const email = 'admin@example.com';
		const salt = await adminSaltForEmail(email);

		const hashA = await hashAdminPassword('stable-password', salt);
		const hashB = await hashAdminPassword('stable-password', salt);

		expect(hashA).toBe(hashB);
		await expect(verifyPassword('stable-password', hashA)).resolves.toBe(true);
	});

	it('produces a different hash when the password changes', async () => {
		const email = 'admin@example.com';
		const salt = await adminSaltForEmail(email);

		const hashOriginal = await hashAdminPassword('original-password', salt);
		const hashChanged = await hashAdminPassword('changed-password', salt);

		expect(hashChanged).not.toBe(hashOriginal);
	});
});
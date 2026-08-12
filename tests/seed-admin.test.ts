import { describe, expect, it } from 'vitest';
import { buildAdminSeedSql, adminSaltForEmail } from '../scripts/db/seed-admin';
import { hashPassword, verifyPassword } from '../worker/lib/password';

const input = {
	id: 'user-1',
	email: 'admin@example.com',
	passwordHash: 'pbkdf2-sha256$100000$c2FsdA==$aGFzaA==',
	now: '2024-02-01T00:00:00.000Z',
};

describe('buildAdminSeedSql', () => {
	it('creates exactly one admin user with a hashed password', () => {
		const sql = buildAdminSeedSql(input);

		expect(sql).toContain('INSERT INTO users (id, email, password_hash, role, created_at)');
		expect(sql).toContain("'user-1'");
		expect(sql).toContain("'admin@example.com'");
		expect(sql).toContain("'pbkdf2-sha256$100000$c2FsdA==$aGFzaA=='");
		expect(sql).toContain("'admin'");
		expect(sql).not.toContain("'hunter2'");
		expect(sql).toMatch(/INSERT INTO users[\s\S]+WHERE users\.password_hash != excluded\.password_hash;/);
	});

	it('only rewrites the password on conflict when the stored hash differs', () => {
		const sql = buildAdminSeedSql(input);

		expect(sql).toContain('ON CONFLICT (email) DO UPDATE SET password_hash = excluded.password_hash');
		expect(sql).toContain('WHERE users.password_hash != excluded.password_hash;');
	});

	it('produces an identical hash for the same email and password', async () => {
		const email = 'admin@example.com';
		const password = 'stable-password';
		const salt = await adminSaltForEmail(email);

		const hashA = await hashPassword(password, 1000, salt);
		const hashB = await hashPassword(password, 1000, salt);

		expect(hashA).toBe(hashB);
		await expect(verifyPassword(password, hashA)).resolves.toBe(true);
	});

	it('produces a different hash when the password changes', async () => {
		const email = 'admin@example.com';
		const salt = await adminSaltForEmail(email);

		const hashOriginal = await hashPassword('original-password', 1000, salt);
		const hashChanged = await hashPassword('changed-password', 1000, salt);

		expect(hashChanged).not.toBe(hashOriginal);
	});
});

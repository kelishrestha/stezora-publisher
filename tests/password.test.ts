import { describe, expect, it } from 'vitest';
import { DEFAULT_ITERATIONS, MAX_ITERATIONS, hashPassword, verifyPassword } from '../worker/lib/password';

describe('password hashing', () => {
	it('verifies a freshly hashed password', async () => {
		const hash = await hashPassword('correct horse battery staple');
		await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
	});

	it('rejects the wrong password', async () => {
		const hash = await hashPassword('correct horse battery staple');
		await expect(verifyPassword('wrong password', hash)).resolves.toBe(false);
	});

	it('rejects the empty string against a real hash', async () => {
		const hash = await hashPassword('correct horse battery staple');
		await expect(verifyPassword('', hash)).resolves.toBe(false);
	});

	it('does not contain the plaintext password in the hash', async () => {
		const password = 'super-secret-plaintext';
		const hash = await hashPassword(password);
		expect(hash).not.toContain(password);
	});

	it('uses the documented pbkdf2-sha256 format', async () => {
		const hash = await hashPassword('password');
		expect(hash.startsWith('pbkdf2-sha256$')).toBe(true);

		const parts = hash.split('$');
		expect(parts).toHaveLength(4);
		expect(Number(parts[1])).toBeGreaterThan(0);
		expect(parts[2]).toBeTruthy();
		expect(parts[3]).toBeTruthy();
	});

	it('produces a different hash per password with the same salt-free scheme', async () => {
		const hashA = await hashPassword('same-password');
		const hashB = await hashPassword('same-password');
		expect(hashA).not.toBe(hashB);
	});

	it('rejects malformed hashes', async () => {
		await expect(verifyPassword('password', 'not-a-hash')).resolves.toBe(false);
		await expect(verifyPassword('password', 'pbkdf2-sha256$abc$def$ghi$jkl')).resolves.toBe(false);
		await expect(verifyPassword('password', 'md5$100000$abc$def')).resolves.toBe(false);
		await expect(verifyPassword('password', '')).resolves.toBe(false);
	});

	it('rejects invalid base64 in the salt or hash instead of throwing', async () => {
		await expect(verifyPassword('password', 'pbkdf2-sha256$100000$!!!$aGFzaA==')).resolves.toBe(false);
		await expect(verifyPassword('password', 'pbkdf2-sha256$100000$c2FsdA==$!!!')).resolves.toBe(false);
	});

	it('rejects hashes with excessive iteration counts', async () => {
		await expect(
			verifyPassword('password', `pbkdf2-sha256$${MAX_ITERATIONS + 1}$c2FsdA==$aGFzaA==`)
		).resolves.toBe(false);
	});

	it('accepts the default iterations as valid', async () => {
		const hash = await hashPassword('password');
		expect(hash.startsWith(`pbkdf2-sha256$${DEFAULT_ITERATIONS}$`)).toBe(true);
		await expect(verifyPassword('password', hash)).resolves.toBe(true);
	});
});

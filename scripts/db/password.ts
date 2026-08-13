import { scrypt } from 'node:crypto';

const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_OPTIONS = {
	N: 16384,
	r: 16,
	p: 1,
	maxmem: 128 * 16384 * 16 * 2,
} as const;

/**
 * Derives a deterministic salt from the admin email so that hashing the same
 * `ADMIN_INITIAL_PASSWORD` always produces the same hash. Without this, a
 * random salt would change the stored hash on every seed run even when the
 * environment variable never changed.
 */
export async function adminSaltForEmail(email: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`stezora-admin-seed:${email}`));
	return Buffer.from(digest.slice(0, 16)).toString('hex');
}

function scryptKey(password: string, saltHex: string): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		scrypt(password.normalize('NFKC'), saltHex, SCRYPT_KEY_LENGTH, SCRYPT_OPTIONS, (error, key) =>
			error ? reject(error) : resolve(key)
		);
	});
}

/**
 * Hashes a password in BetterAuth's storage format (`salt:key`, hex-encoded)
 * so a seeded admin can sign in through the BetterAuth API. The scrypt
 * parameters mirror `@better-auth/utils/password` (N=16384, r=16, p=1,
 * dkLen=64); the salt passed as a utf8-hex string matches BetterAuth's use of
 * `hex.encode` before scrypt.
 */
export async function hashAdminPassword(password: string, saltHex: string): Promise<string> {
	const key = await scryptKey(password, saltHex);
	return `${saltHex}:${key.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
	const [saltHex, keyHex] = encoded.split(':');
	if (!saltHex || !keyHex) {
		return false;
	}
	const key = await scryptKey(password, saltHex);
	return key.toString('hex') === keyHex;
}
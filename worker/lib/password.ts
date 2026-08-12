const PREFIX = 'pbkdf2-sha256';
const HASH = 'SHA-256';
const SALT_BYTES = 16;
const KEY_BYTES = 32;
export const DEFAULT_ITERATIONS = 100_000;
// OWASP currently recommends a higher count for PBKDF2-SHA256 (600k+); 100k is
// a deliberate CPU budget for a single-user admin on Workers. Revisit when the
// Phase 4 login endpoint ships (alongside the login_attempts rate limit).
// Ceiling for iterations read from a stored hash so a corrupted DB value can
// never turn a login attempt into a CPU-exhaustion loop.
export const MAX_ITERATIONS = 2_000_000;

function toBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array<ArrayBuffer>> {
	const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
		'deriveBits',
	]);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', salt, iterations, hash: HASH },
		keyMaterial,
		KEY_BYTES * 8
	);
	return new Uint8Array(bits);
}

/**
 * Hashes a password with PBKDF2-SHA256. Uses a random salt unless one is
 * provided, which lets callers (such as the admin seed) produce a deterministic
 * hash for the same password so unchanged credentials are never rewritten.
 * Encoded format: `pbkdf2-sha256$<iterations>$<saltBase64>$<hashBase64>`.
 */
export async function hashPassword(
	password: string,
	iterations: number = DEFAULT_ITERATIONS,
	salt: Uint8Array<ArrayBuffer> = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
): Promise<string> {
	const hash = await deriveKey(password, salt, iterations);
	return `${PREFIX}$${iterations}$${toBase64(salt)}$${toBase64(hash)}`;
}

/**
 * Verifies a password against an encoded hash. Returns false for malformed
 * hashes (including invalid base64) and for length mismatches so callers can
 * use a single error path.
 */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
	const parts = encoded.split('$');
	if (parts.length !== 4 || parts[0] !== PREFIX) {
		return false;
	}
	const iterations = Number(parts[1]);
	if (!Number.isSafeInteger(iterations) || iterations <= 0 || iterations > MAX_ITERATIONS) {
		return false;
	}
	let salt: Uint8Array<ArrayBuffer>;
	let expected: Uint8Array<ArrayBuffer>;
	try {
		salt = fromBase64(parts[2]);
		expected = fromBase64(parts[3]);
	} catch {
		return false;
	}
	if (expected.byteLength !== KEY_BYTES) {
		return false;
	}
	const actual = await deriveKey(password, salt, iterations);
	return timingSafeEqual(actual, expected);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.byteLength !== b.byteLength) {
		return false;
	}
	let diff = 0;
	for (let i = 0; i < a.byteLength; i += 1) {
		diff |= a[i] ^ b[i];
	}
	return diff === 0;
}

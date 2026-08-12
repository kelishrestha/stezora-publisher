import { pathToFileURL } from 'node:url';
import { DEFAULT_ITERATIONS, hashPassword } from '../../worker/lib/password';
import { sqlString } from './sql';

export interface AdminSeedInput {
	id: string;
	email: string;
	passwordHash: string;
	now: string;
}

/**
 * Derives a deterministic salt from the admin email so that hashing the same
 * `ADMIN_INITIAL_PASSWORD` always produces the same hash. Without this, the
 * random salt in `hashPassword` would change the stored hash on every seed run
 * even when the environment variable never changed.
 */
export async function adminSaltForEmail(email: string): Promise<Uint8Array<ArrayBuffer>> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`stezora-admin-seed:${email}`));
	return new Uint8Array(digest).slice(0, 16);
}

/**
 * Builds the SQL that creates or updates the single admin user.
 *
 * The password is stored as a PBKDF2-SHA256 hash, never plaintext. On conflict
 * the password is only rewritten when the stored hash differs from the hash of
 * the current `ADMIN_INITIAL_PASSWORD`, so re-running the seed never alters the
 * password unless the environment variable actually changed.
 */
export function buildAdminSeedSql(input: AdminSeedInput): string {
	return [
		'INSERT INTO users (id, email, password_hash, role, created_at)',
		`VALUES (${sqlString(input.id)}, ${sqlString(input.email)}, ${sqlString(input.passwordHash)}, 'admin', ${sqlString(input.now)})`,
		'ON CONFLICT (email) DO UPDATE SET password_hash = excluded.password_hash',
		'WHERE users.password_hash != excluded.password_hash;',
	].join('\n');
}

async function main(): Promise<void> {
	const email = process.env.ADMIN_EMAIL;
	const password = process.env.ADMIN_INITIAL_PASSWORD;

	if (!email) {
		console.error('ADMIN_EMAIL is required to seed the admin user. Set it in .env.development (see .env.example).');
		process.exit(1);
	}
	if (!password) {
		console.error(
			'ADMIN_INITIAL_PASSWORD is required to seed the admin user. Set it in .env.development (see .env.example).'
		);
		process.exit(1);
	}

	const passwordHash = await hashPassword(password, DEFAULT_ITERATIONS, await adminSaltForEmail(email));
	const now = new Date().toISOString();
	const id = crypto.randomUUID();

	process.stdout.write(`${buildAdminSeedSql({ id, email, passwordHash, now })}\n`);
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMain) {
	await main();
}

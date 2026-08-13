import { pathToFileURL } from 'node:url';
import { adminSaltForEmail, hashAdminPassword } from './password';
import { sqlNullable, sqlString } from './sql';

export interface AdminSeedInput {
	userId: string;
	accountId: string;
	email: string;
	passwordHash: string;
	nowMs: number;
}

/**
 * Builds the SQL that creates or updates the single admin user and its
 * BetterAuth credential account.
 *
 * BetterAuth stores email/password credentials in the `account` table
 * (`provider_id = 'credential'`), not on `user`. The user id and account id
 * are derived from the admin email so the seed is idempotent, and the account
 * insert looks the user id up by email to stay correct even if the user row
 * pre-exists with a different id.
 *
 * Timestamps are unix-milliseconds (`timestamp_ms`), `email_verified` is
 * disabled, and the password is stored as a BetterAuth scrypt hash
 * (`salt:key`), never plaintext. On conflict the password is only rewritten
 * when the stored hash differs from the hash of the current
 * `ADMIN_INITIAL_PASSWORD`, so re-running the seed never alters the password
 * unless the environment variable actually changed.
 */
export function buildAdminSeedSql(input: AdminSeedInput): string {
	const timestamp = String(input.nowMs);
	return [
		'INSERT INTO user (id, name, email, email_verified, image, created_at, updated_at, role)',
		`VALUES (${sqlString(input.userId)}, 'Site Admin', ${sqlString(input.email)}, 0, ${sqlNullable(undefined)}, ${timestamp}, ${timestamp}, 'admin')`,
		'ON CONFLICT (email) DO UPDATE SET name = excluded.name, role = excluded.role;',
		'',
		'INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)',
		`SELECT ${sqlString(input.accountId)}, u.id, 'credential', u.id, ${sqlString(input.passwordHash)}, ${timestamp}, ${timestamp}`,
		`FROM user u WHERE u.email = ${sqlString(input.email)}`,
		'ON CONFLICT (id) DO UPDATE SET password = excluded.password',
		'WHERE account.password != excluded.password;',
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

	const saltHex = await adminSaltForEmail(email);
	const passwordHash = await hashAdminPassword(password, saltHex);
	const nowMs = Date.now();

	process.stdout.write(
		`${buildAdminSeedSql({ userId: `usr-${saltHex}`, accountId: `acc-${saltHex}`, email, passwordHash, nowMs })}\n`
	);
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMain) {
	await main();
}
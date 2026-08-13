import { betterAuth } from 'better-auth';
import { drizzleAdapter, type DB as AdapterDatabase } from '@better-auth/drizzle-adapter';
import * as schema from '../db/schema';

export interface AuthOptions {
	secret: string;
	baseURL: string;
	trustedOrigins: string[];
}

/**
 * Creates the BetterAuth instance for the CMS. The database handle is injected
 * so the same configuration drives the Worker (D1) and the schema-generation
 * CLI (a no-op proxy handle).
 *
 * `role` is a non-user-editable additional field defaulting to 'admin' — the
 * authorization layer reads it from the session user (DEVELOPER.md §13).
 */
export function createAuth(db: AdapterDatabase, options: AuthOptions) {
	return betterAuth({
		appName: 'stezora-publisher',
		secret: options.secret,
		baseURL: options.baseURL,
		trustedOrigins: options.trustedOrigins,
		database: drizzleAdapter(db, { provider: 'sqlite', schema }),
		emailAndPassword: { enabled: true },
		user: {
			additionalFields: {
				role: { type: 'string', defaultValue: 'admin', input: false },
			},
		},
		rateLimit: { enabled: true },
	});
}

export type Auth = ReturnType<typeof createAuth>;

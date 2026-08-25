import { betterAuth } from 'better-auth';
import { drizzleAdapter, type DB as AdapterDatabase } from '@better-auth/drizzle-adapter';
import * as schema from '../db/schema';
import { createDb } from '../db/client';

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
 * `role` is a non-user-editable additional field. Accounts are provisioned by
 * the seed script; public sign-up is disabled.
 */
export function createAuth(db: AdapterDatabase, options: AuthOptions) {
	return betterAuth({
		appName: 'stezora-publisher',
		secret: options.secret,
		baseURL: options.baseURL,
		trustedOrigins: options.trustedOrigins,
		database: drizzleAdapter(db, { provider: 'sqlite', schema }),
		emailAndPassword: { enabled: true, disableSignUp: true },
		user: {
			additionalFields: {
				role: { type: 'string', defaultValue: 'admin', input: false },
			},
		},
		rateLimit: {
			enabled: true,
			window: 60,
			max: 30,
			storage: 'database',
			customRules: {
				// BetterAuth ships a default sign-in rule (window 10 / max 3) that
				// would lock a legitimate owner out after three attempts. Raise the
				// ceiling while keeping a tight per-IP bucket (DEVELOPER.md §45).
				'/sign-in/*': { window: 60, max: 30 },
			},
		},
	});
}

export type Auth = ReturnType<typeof createAuth>;

/**
 * Resolves the BetterAuth instance for a request origin, caching one instance
 * per origin so repeated /api/auth and /admin gate checks share state (in
 * particular the DB-backed rate-limit rows) without rebuilding the adapter.
 */
const authCache = new Map<string, Auth>();

export function getAuth(request: Request, env: Env): Auth {
	const origin = new URL(request.url).origin;
	const cached = authCache.get(origin);
	if (cached) {
		return cached;
	}
	const auth = createAuth(createDb(env.DB), {
		secret: env.BETTER_AUTH_SECRET,
		baseURL: origin,
		trustedOrigins: [origin],
	});
	authCache.set(origin, auth);
	return auth;
}

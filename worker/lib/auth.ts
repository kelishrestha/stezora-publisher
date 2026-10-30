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
				// Sign-in is the single most attacked endpoint (one admin account,
				// password-only), so it gets a tight per-IP bucket: 10 attempts per
				// minute. That is far more than a human needs (a correct sign-in
				// takes one or two tries) yet caps brute force at 10/min/IP. Note
				// this is per-IP and has no hard lockout, so a strong admin password
				// and 2FA remain the primary defenses (DEVELOPER.md §45).
				'/sign-in/*': { window: 60, max: 10 },
			},
		},
	});
}

export type Auth = ReturnType<typeof createAuth>;

/**
 * Resolves the canonical origin for auth. When `BETTER_AUTH_URL` is set (it is
 * in production), the session's `baseURL` and the single trusted origin are
 * pinned to it, so the auth surface trusts only the real domain and never
 * whatever host a request happens to arrive on (for example the deployment's
 * `*.workers.dev` subdomain). Falls back to the request origin for local
 * `wrangler dev` and tests, where no canonical URL is configured.
 */
function resolveOrigin(request: Request, env: Env): string {
	const configured = env.BETTER_AUTH_URL?.trim();
	if (configured) {
		try {
			return new URL(configured).origin;
		} catch {
			// Fall through to the request origin on a malformed configured value.
		}
	}
	return new URL(request.url).origin;
}

/**
 * Resolves the BetterAuth instance for a request origin, caching one instance
 * per origin so repeated /api/auth and /admin gate checks share state (in
 * particular the DB-backed rate-limit rows) without rebuilding the adapter.
 */
const authCache = new Map<string, Auth>();

export function getAuth(request: Request, env: Env): Auth {
	const origin = resolveOrigin(request, env);
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

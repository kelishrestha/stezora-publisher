// BetterAuth CLI configuration — used ONLY to generate the auth schema
// (pnpm better-auth:generate). Never imported by the Worker or the site.
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import type { DB as AdapterDatabase } from '@better-auth/drizzle-adapter';
import { createAuth } from './worker/lib/auth';
import * as schema from './worker/db/schema';

// No-op proxy handle: schema generation never issues queries.
const db = drizzle(async () => ({ rows: [] }), { schema }) as unknown as AdapterDatabase;

export const auth = createAuth(db, {
	secret: 'cli-only-secret',
	baseURL: 'http://localhost:8787',
	trustedOrigins: ['http://localhost:8787'],
});

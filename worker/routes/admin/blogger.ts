import { z } from 'zod';
import { fail, ok } from '../../lib/http';
import { readJsonBody } from '../../lib/validate';
import { BloggerNotConfiguredError, importBlogger, refreshBloggerStats, resolveBloggerCredentials, writeBloggerRefreshToken } from '../../lib/blogger-import';
import type { AuthenticatedHandler } from '../../lib/middleware';

const importPayload = z.object({ includeDrafts: z.boolean().default(false) });

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const BLOGGER_SCOPE = 'https://www.googleapis.com/auth/blogger';
const SETTINGS_PATH = '/admin/settings/integrations';

/**
 * POST /api/admin/blogger/import
 * Imports posts from the linked Blogger blogs into D1. Body: { includeDrafts }.
 * Returns a per-publication summary. New content shows in the CMS immediately;
 * the public site reflects it on the next build and deploy.
 */
export const bloggerImport: AuthenticatedHandler = async ({ env, request }) => {
	const { includeDrafts } = importPayload.parse(await readJsonBody(request));
	try {
		const summary = await importBlogger(env.DB, await resolveBloggerCredentials(env.DB, env), { includeDrafts });
		return ok(summary);
	} catch (error) {
		if (error instanceof BloggerNotConfiguredError) {
			return fail('blogger_not_configured', error.message, 400);
		}
		return fail('blogger_import_failed', error instanceof Error ? error.message : 'Blogger import failed.', 502);
	}
};

/**
 * POST /api/admin/blogger/stats
 * Refreshes the Blogger blog-level pageview totals for every linked blog.
 */
export const bloggerStats: AuthenticatedHandler = async ({ env }) => {
	try {
		const summary = await refreshBloggerStats(env.DB, await resolveBloggerCredentials(env.DB, env));
		return ok(summary);
	} catch (error) {
		if (error instanceof BloggerNotConfiguredError) {
			return fail('blogger_not_configured', error.message, 400);
		}
		const message = error instanceof Error ? error.message : 'Could not refresh Blogger statistics.';
		if (/ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient/i.test(message)) {
			return fail('blogger_scope_insufficient', 'The Blogger credentials cannot read pageviews. Re-authorize with the full blogger scope.', 403);
		}
		return fail('blogger_stats_failed', message, 502);
	}
};

function redirectTo(path: string, setCookie?: string): Response {
	const headers: Record<string, string> = { Location: path };
	if (setCookie) headers['Set-Cookie'] = setCookie;
	return new Response(null, { status: 302, headers });
}

function stateCookie(value: string, secure: boolean, maxAge: number): string {
	return `blogger_oauth_state=${value}; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

function readStateCookie(request: Request): string | null {
	const header = request.headers.get('cookie') ?? '';
	const match = /(?:^|;\s*)blogger_oauth_state=([^;]+)/.exec(header);
	return match ? decodeURIComponent(match[1]) : null;
}

/**
 * GET /api/admin/blogger/oauth/start
 * Begins the Blogger OAuth consent flow. Redirects to Google with the full
 * blogger scope and a CSRF state cookie; the callback stores the refresh token.
 */
export const bloggerOauthStart: AuthenticatedHandler = async ({ env, request }) => {
	if (!env.BLOGGER_CLIENT_ID || !env.BLOGGER_CLIENT_SECRET) {
		return fail('blogger_not_configured', 'Blogger client id and secret are not configured on the server.', 400);
	}
	const origin = new URL(request.url).origin;
	const redirectUri = `${origin}/api/admin/blogger/oauth/callback`;
	const state = crypto.randomUUID();

	const authUrl = new URL(GOOGLE_AUTH_URL);
	authUrl.searchParams.set('client_id', env.BLOGGER_CLIENT_ID);
	authUrl.searchParams.set('redirect_uri', redirectUri);
	authUrl.searchParams.set('response_type', 'code');
	authUrl.searchParams.set('scope', BLOGGER_SCOPE);
	authUrl.searchParams.set('access_type', 'offline');
	// prompt=consent forces Google to return a refresh token on re-authorization.
	authUrl.searchParams.set('prompt', 'consent');
	authUrl.searchParams.set('include_granted_scopes', 'true');
	authUrl.searchParams.set('state', state);

	return redirectTo(authUrl.toString(), stateCookie(state, origin.startsWith('https'), 600));
};

/**
 * GET /api/admin/blogger/oauth/callback
 * Verifies the CSRF state, exchanges the code for a refresh token, stores it in
 * D1, and redirects back to the integrations page with a status flag.
 */
export const bloggerOauthCallback: AuthenticatedHandler = async ({ env, request }) => {
	const url = new URL(request.url);
	const origin = url.origin;
	const clearCookie = stateCookie('', origin.startsWith('https'), 0);
	const back = (params: string) => redirectTo(`${SETTINGS_PATH}?${params}#blogger`, clearCookie);

	const errorParam = url.searchParams.get('error');
	if (errorParam) {
		return back(`blogger_error=${encodeURIComponent(errorParam)}`);
	}

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const expectedState = readStateCookie(request);
	if (!code || !state || !expectedState || state !== expectedState) {
		return back('blogger_error=state_mismatch');
	}
	if (!env.BLOGGER_CLIENT_ID || !env.BLOGGER_CLIENT_SECRET) {
		return back('blogger_error=not_configured');
	}

	const body = new URLSearchParams({
		code,
		client_id: env.BLOGGER_CLIENT_ID,
		client_secret: env.BLOGGER_CLIENT_SECRET,
		redirect_uri: `${origin}/api/admin/blogger/oauth/callback`,
		grant_type: 'authorization_code',
	});
	const response = await fetch(GOOGLE_TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
	if (!response.ok) {
		return back('blogger_error=token_exchange_failed');
	}
	const data = (await response.json()) as { refresh_token?: string };
	if (!data.refresh_token) {
		// Google omits the refresh token when the app was already authorized
		// without prompt=consent; our prompt=consent should prevent this.
		return back('blogger_error=no_refresh_token');
	}

	await writeBloggerRefreshToken(env.DB, data.refresh_token);
	return back('blogger=authorized');
};

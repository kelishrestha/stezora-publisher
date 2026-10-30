import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { timingSafeEqual as cryptoTimingSafeEqual } from 'node:crypto';
import { writeBloggerRefreshToken } from './token-store';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
// Full blogger scope, not blogger.readonly: the pageviews endpoint (statistics
// import) is owner-only data that the read-only scope cannot reach.
const SCOPE = 'https://www.googleapis.com/auth/blogger';
const PORT = Number(process.env.BLOGGER_OAUTH_PORT ?? 8765);
const REDIRECT_URI = `http://localhost:${PORT}/`;

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required environment variable ${name}`);
	}
	return value;
}

function authUrl(clientId: string, state: string): string {
	const query = new URLSearchParams({
		client_id: clientId,
		redirect_uri: REDIRECT_URI,
		response_type: 'code',
		scope: SCOPE,
		access_type: 'offline',
		prompt: 'consent',
		include_granted_scopes: 'true',
		state,
	});
	return `${AUTH_URL}?${query.toString()}`;
}

function timingSafeEqual(a: string, b: string): boolean {
	const aBytes = Buffer.from(a);
	const bBytes = Buffer.from(b);
	return aBytes.length === bBytes.length && cryptoTimingSafeEqual(aBytes, bBytes);
}

async function exchangeCode(code: string, clientId: string, clientSecret: string): Promise<{ access_token?: string; refresh_token?: string }> {
	const body = new URLSearchParams({
		code,
		client_id: clientId,
		client_secret: clientSecret,
		redirect_uri: REDIRECT_URI,
		grant_type: 'authorization_code',
	});

	const response = await fetch(TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body,
	});

	if (!response.ok) {
		throw new Error(`Token exchange failed: ${response.status} ${await response.text()}`);
	}

	return (await response.json()) as { access_token?: string; refresh_token?: string };
}

async function main(): Promise<void> {
	const clientId = requireEnv('BLOGGER_CLIENT_ID');
	const clientSecret = requireEnv('BLOGGER_CLIENT_SECRET');
	const state = randomBytes(16).toString('hex');

	const url = authUrl(clientId, state);
	console.log('\n1. Open this URL in your browser and authorize access:\n');
	console.log(`   ${url}\n`);
	console.log('   (Make sure the redirect URI below is registered in the Google Cloud\n');
	console.log(`    OAuth client, or the flow will fail.)\n`);
	console.log(`2. Waiting for the authorization redirect on ${REDIRECT_URI} ...\n`);

	const tokens = await new Promise<{ access_token?: string; refresh_token?: string }>((resolve, reject) => {
		const server = createServer(async (req, res) => {
			try {
				const requestUrl = new URL(req.url ?? '/', REDIRECT_URI);
				const receivedState = requestUrl.searchParams.get('state');
				if (!receivedState || !timingSafeEqual(receivedState, state)) {
					res.writeHead(403, { 'Content-Type': 'text/plain' });
					res.end('State mismatch. Authorization rejected.');
					return;
				}
				const code = requestUrl.searchParams.get('code');
				if (!code) {
					res.writeHead(400, { 'Content-Type': 'text/plain' });
					res.end('Missing authorization code.');
					return;
				}
				res.writeHead(200, { 'Content-Type': 'text/html' });
				res.end('<html><body><p>Authorization complete. You can close this tab.</p></body></html>');
				server.close();
				resolve(await exchangeCode(code, clientId, clientSecret));
			} catch (error) {
				server.close();
				reject(error);
			}
		});
		server.listen(PORT, 'localhost', () => {
			console.log(`Listening on ${REDIRECT_URI}`);
		});
	});

	if (!tokens.refresh_token) {
		throw new Error('No refresh_token returned. The access token is available once, on first consent — re-run after revoking app access in the Google account security settings.');
	}

	console.log('\nRefresh token obtained.');
	await writeBloggerRefreshToken(tokens.refresh_token);
	console.log('\nYou can now run: pnpm blogger:import --all');
}

main().catch((error) => {
	console.error(`\nOAuth failed: ${error instanceof Error ? error.message : error}`);
	process.exitCode = 1;
});

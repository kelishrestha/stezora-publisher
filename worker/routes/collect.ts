import { createDb } from '../db/client';
import { pageViews } from '../db/schema';
import type { RouteHandler } from '../router';

/**
 * POST /api/collect
 *
 * First-party, cookieless-by-default pageview collection. A small client beacon
 * (src/lib/analytics/track.ts) posts the path and referrer; the Worker adds the
 * geography Cloudflare already resolved (`request.cf`), classifies the device,
 * filters bots, and records the view in D1. Two visitor identifiers are stored:
 *
 * - `visitor_hash`: a daily-rotated salted hash of IP + user agent, so each
 *   person counts once per day with no cookie and no consent banner.
 * - `visitor_id`: a stable first-party cookie so the admin dashboard can show an
 *   accurate all-time unique count.
 *
 * The response is always 204; the D1 write runs in `waitUntil` so it never
 * delays the page.
 */

const COOKIE_NAME = 'sv_id';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 2; // two years

// Conservative bot filter: common crawlers, preview bots, and HTTP libraries.
const BOT_PATTERN =
	/bot|crawl|spider|slurp|mediapartners|bingpreview|facebookexternalhit|embedly|quora link preview|pinterest|vkshare|whatsapp|telegram|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python-requests|axios|node-fetch|go-http/i;

interface CfGeo {
	country?: string;
	region?: string;
	city?: string;
	continent?: string;
}

function classifyDevice(ua: string): string {
	if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
	if (/mobi|android|iphone|ipod|phone/i.test(ua)) return 'mobile';
	return 'desktop';
}

function parseCookies(header: string | null): Record<string, string> {
	const out: Record<string, string> = {};
	if (!header) return out;
	for (const part of header.split(';')) {
		const index = part.indexOf('=');
		if (index === -1) continue;
		out[part.slice(0, index).trim()] = part.slice(index + 1).trim();
	}
	return out;
}

/** Referrer hostname only, and never the site's own origin (internal nav). */
function referrerHost(referrer: unknown, selfOrigin: string): string | null {
	if (typeof referrer !== 'string' || !referrer) return null;
	try {
		const url = new URL(referrer);
		if (url.origin === selfOrigin) return null;
		return url.hostname.slice(0, 255);
	} catch {
		return null;
	}
}

async function dailyVisitorHash(ip: string, ua: string, salt: string, day: string): Promise<string> {
	const data = new TextEncoder().encode(`${salt}:${day}:${ip}:${ua}`);
	const digest = await crypto.subtle.digest('SHA-256', data);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

/**
 * Maps `/poetry-collections/<publication>/posts/<post>` to its slugs. The URL's
 * post segment is the publication-prefixed content id, so the prefix is stripped
 * to get the bare post slug that matches `posts.slug` in D1.
 */
function resolvePost(path: string): { publication: string | null; post: string | null } {
	const match = /^\/poetry-collections\/([^/]+)\/posts\/([^/]+)\/?$/.exec(path);
	if (!match) return { publication: null, post: null };
	const publication = match[1];
	const prefix = `${publication}-`;
	const segment = match[2];
	const post = segment.startsWith(prefix) ? segment.slice(prefix.length) : segment;
	return { publication, post };
}

export const collect: RouteHandler = async ({ request, env, ctx }) => {
	const ua = request.headers.get('user-agent') ?? '';
	// Drop bots and empty user agents before doing any work.
	if (!ua || BOT_PATTERN.test(ua)) {
		return new Response(null, { status: 204 });
	}

	let body: { p?: unknown; r?: unknown; c?: unknown };
	try {
		body = (await request.json()) as { p?: unknown; r?: unknown; c?: unknown };
	} catch {
		return new Response(null, { status: 204 });
	}

	const path = typeof body.p === 'string' ? body.p.slice(0, 512) : '';
	if (!path.startsWith('/')) {
		return new Response(null, { status: 204 });
	}

	const origin = new URL(request.url).origin;
	const ip = request.headers.get('cf-connecting-ip') ?? '';
	const cf = ((request as Request & { cf?: CfGeo }).cf ?? {}) as CfGeo;
	const salt = env.ANALYTICS_SALT ?? env.BETTER_AUTH_SECRET;
	const now = new Date();
	const visitorHash = await dailyVisitorHash(ip, ua, salt, now.toISOString().slice(0, 10));

	// The stable visitor cookie is only used with explicit consent (the consent
	// banner sends `c: true`). Cookieless per-day analytics run regardless; the
	// cookie only improves the all-time unique total.
	const consent = body.c === true;
	const cookies = parseCookies(request.headers.get('cookie'));
	const existingId = cookies[COOKIE_NAME];

	const headers = new Headers();
	let visitorId: string | null = null;
	if (consent) {
		visitorId = existingId ?? crypto.randomUUID();
		if (!existingId) {
			headers.append(
				'set-cookie',
				`${COOKIE_NAME}=${visitorId}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax; Secure; HttpOnly`
			);
		}
	} else if (existingId) {
		// Consent declined or withdrawn: drop any stable id cookie.
		headers.append('set-cookie', `${COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax; Secure; HttpOnly`);
	}

	const { publication, post } = resolvePost(path);

	const db = createDb(env.DB);
	const write = db
		.insert(pageViews)
		.values({
			id: crypto.randomUUID(),
			path,
			publication_slug: publication,
			post_slug: post,
			referrer_host: referrerHost(body.r, origin),
			country: cf.country ?? null,
			region: cf.region ?? null,
			city: cf.city ?? null,
			continent: cf.continent ?? null,
			device: classifyDevice(ua),
			visitor_hash: visitorHash,
			visitor_id: visitorId,
			created_at: now.toISOString(),
		})
		.then(() => undefined)
		.catch(() => undefined);
	ctx.waitUntil(write);

	return new Response(null, { status: 204, headers });
};

/**
 * Per-publication Blogger integration configuration.
 *
 * Values are read from `process.env`. This module is currently used only by
 * Node scripts (tsx). When a Cloudflare Worker needs this config (Phase 5),
 * it must read from environment bindings instead of `process.env`.
 */

const BLOG_ID_SUFFIX = 'BLOG_ID';
const BLOG_URL_SUFFIX = 'BLOG_URL';

function envKey(slug: string, suffix: string): string {
	const normalized = slug.toUpperCase().replace(/-/g, '_');
	return `BLOGGER_${normalized}_${suffix}`;
}

function requireEnv(key: string, slug: string): string {
	const value = process.env[key];
	if (!value) {
		throw new Error(
			`Missing required environment variable ${key} for publication "${slug}". ` +
				'Set it in .env.development (see .env.example).'
		);
	}
	return value;
}

/**
 * Blogger blog IDs are numeric. Validate eagerly so configuration mistakes
 * surface at startup instead of as a confusing Blogger API error.
 */
function validateBlogId(slug: string, blogId: string): void {
	if (!/^\d+$/.test(blogId)) {
		throw new Error(
			`Invalid Blogger blog ID "${blogId}" for publication "${slug}". ` +
				`Expected a numeric string in ${envKey(slug, BLOG_ID_SUFFIX)}.`
		);
	}
}

function normalizeBlogUrl(slug: string, raw: string): string {
	const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
	try {
		return new URL(candidate).toString();
	} catch {
		throw new Error(
			`Invalid Blogger blog URL "${raw}" for publication "${slug}". ` +
				`Expected an absolute URL in ${envKey(slug, BLOG_URL_SUFFIX)}.`
		);
	}
}

export function bloggerBlogIdForPublication(slug: string): string {
	const blogId = requireEnv(envKey(slug, BLOG_ID_SUFFIX), slug);
	validateBlogId(slug, blogId);
	return blogId;
}

/**
 * Optional: returns `undefined` when unset. The blog URL is not needed by the
 * import itself; its consumers are redirect/canonical and sync logic.
 */
export function bloggerUrlForPublication(slug: string): string | undefined {
	const raw = process.env[envKey(slug, BLOG_URL_SUFFIX)];
	if (!raw) {
		return undefined;
	}
	return normalizeBlogUrl(slug, raw);
}

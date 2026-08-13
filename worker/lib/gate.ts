/**
 * Admin static-page gate. `/admin/*` pages are only served to authenticated
 * sessions; `/admin/login` is the single public exception. The predicate and
 * asset-path mapping live here so the security-critical decisions can be unit
 * tested without the Worker runtime (the vitest pool does not emulate
 * `env.ASSETS`).
 */
export const ADMIN_LOGIN_PREFIX = '/admin/login';

export function isAdminAssetRequest(pathname: string): boolean {
	return (
		pathname.startsWith('/admin') &&
		pathname !== ADMIN_LOGIN_PREFIX &&
		!pathname.startsWith(`${ADMIN_LOGIN_PREFIX}/`)
	);
}

/**
 * Astro emits static pages as `index.html`, so the browser path `/admin/posts`
 * maps to the asset `/admin/posts/index.html`.
 */
export function adminAssetPath(pathname: string): string {
	const withoutTrailingSlash = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
	return `${withoutTrailingSlash || '/admin'}/index.html`;
}
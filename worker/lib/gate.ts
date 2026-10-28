/**
 * Admin static-page gate. `/admin/*` pages are only served to authenticated
 * sessions; `/admin/login` is the single public exception. The predicate and
 * asset-path mapping live here so the security-critical decisions can be unit
 * tested without the Worker runtime (the vitest pool does not emulate
 * `env.ASSETS`).
 */
export const ADMIN_LOGIN_PREFIX = '/admin/login';

/**
 * The admin edit and view pages are static shells
 * (`src/pages/admin/posts/edit.astro`, `src/pages/admin/posts/view.astro`),
 * so `/admin/posts/:id/edit` and `/admin/posts/:id/view` map to those shells'
 * assets instead of a per-post file. `PostEditor`/`PostView` read the id from
 * the URL path on the client (DEVELOPER.md §70). Other admin paths map to
 * their own built `index.html`.
 */
export function isAdminEditPath(pathname: string): boolean {
	return /^\/admin\/posts\/[^/]+\/edit$/.test(pathname);
}

export function isAdminViewPath(pathname: string): boolean {
	return /^\/admin\/posts\/[^/]+\/view$/.test(pathname);
}

export function isAdminAssetRequest(pathname: string): boolean {
	return (
		pathname.startsWith('/admin') &&
		pathname !== ADMIN_LOGIN_PREFIX &&
		!pathname.startsWith(`${ADMIN_LOGIN_PREFIX}/`)
	);
}

/**
 * Astro emits static pages as `index.html`, so the browser path `/admin/posts`
 * maps to the built asset directory `/admin/posts/`. The mapping returns the
 * trailing-slash directory form (not `.../index.html`) because the assets
 * layer's auto trailing-slash handling 307-redirects explicit `index.html`
 * paths back to the directory, which would loop through this gate forever.
 * Like `POST /api/admin/posts`, `/admin/posts/:id/edit` needs no per-post
 * asset; it intentionally maps every id onto the one static editor shell.
 * The same applies to `/admin/posts/:id/view`.
 */
export function adminAssetPath(pathname: string): string {
	const withoutTrailingSlash = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
	if (isAdminEditPath(withoutTrailingSlash)) {
		return '/admin/posts/edit/';
	}
	if (isAdminViewPath(withoutTrailingSlash)) {
		return '/admin/posts/view/';
	}
	return `${withoutTrailingSlash || '/admin'}/`;
}
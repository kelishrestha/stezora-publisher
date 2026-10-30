/**
 * Timezone-aware date formatting for the admin UI. The admin's chosen IANA
 * timezone is cached in localStorage (synced from the server setting by the
 * settings page) and defaults to Nepal time. All admin date/time displays go
 * through these helpers so they honor the selector.
 */

export const ADMIN_TZ_KEY = 'stezora_tz';
export const DEFAULT_TZ = 'Asia/Kathmandu';

export function getAdminTimeZone(): string {
	if (typeof window === 'undefined') return DEFAULT_TZ;
	try {
		return window.localStorage.getItem(ADMIN_TZ_KEY) || DEFAULT_TZ;
	} catch {
		return DEFAULT_TZ;
	}
}

export function setAdminTimeZone(timezone: string): void {
	try {
		window.localStorage.setItem(ADMIN_TZ_KEY, timezone);
	} catch {
		/* storage unavailable: fall back to the default for this session */
	}
}

/** Date only, e.g. "Feb 2, 2026", in the admin timezone. */
export function formatDate(value: string | null): string {
	if (!value) return '–';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: getAdminTimeZone() });
}

/** Date and time, e.g. "Feb 2, 02:15 PM", in the admin timezone. */
export function formatDateTime(value: string | null): string {
	if (!value) return '–';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: getAdminTimeZone() });
}

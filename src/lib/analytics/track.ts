import Analytics from 'analytics';

/**
 * Client-side pageview capture. Uses the `analytics` abstraction with a custom
 * first-party plugin that beacons to our own `/api/collect` (same-origin, so no
 * CSP change and no third party). The `analytics` layer is here so the commerce
 * phase can add structured events (product_viewed, checkout_started, purchase)
 * through the same `track()` API and the same first-party plugin.
 *
 * Admin pages are never tracked.
 */
export const CONSENT_KEY = 'stezora_consent';

/**
 * The visitor cookie is treated as a necessary cookie and is on by default
 * (opt-out): consent counts as granted unless the visitor has explicitly
 * declined via the cookie notice.
 */
function hasCookieConsent(): boolean {
	try {
		return window.localStorage.getItem(CONSENT_KEY) !== 'denied';
	} catch {
		return true;
	}
}

export function initPageTracking(): void {
	if (typeof window === 'undefined') return;
	if (window.location.pathname.startsWith('/admin')) return;

	const analytics = Analytics({
		app: 'stezora',
		plugins: [
			{
				name: 'stezora-first-party',
				page: () => {
					// Cookieless pageview always; the stable visitor cookie only with
					// consent (the Worker gates the cookie on this flag).
					const payload = JSON.stringify({
						p: window.location.pathname,
						r: document.referrer,
						c: hasCookieConsent(),
					});
					if (navigator.sendBeacon) {
						navigator.sendBeacon('/api/collect', new Blob([payload], { type: 'application/json' }));
					} else {
						void fetch('/api/collect', {
							method: 'POST',
							headers: { 'content-type': 'application/json' },
							body: payload,
							keepalive: true,
						}).catch(() => undefined);
					}
				},
			},
		],
	});

	analytics.page();
}

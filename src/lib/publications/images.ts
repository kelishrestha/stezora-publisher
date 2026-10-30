/**
 * Sized variants for externally hosted featured images. Imported posts still
 * hotlink Blogger's CDN (and a couple of Unsplash originals, one of which is
 * an 8.8 MB JPEG), so cards must never load the full-size file. Both hosts
 * support resize hints; everything else passes through untouched. Proper
 * localization into R2 replaces this eventually.
 */
export function imageVariant(url: string, width: number): string {
	// Locally served images (public/localized) ship as a card and a full
	// variant; map the full path down to the card one for small requests.
	if (url.startsWith('/localized/')) {
		return width <= 768 ? url.replace(/-1024\.(\w+)$/, '-640.$1') : url;
	}
	// Imported URLs came out of HTML attributes; undo entity-encoded ampersands.
	const clean = url.replace(/&amp;/g, '&');
	try {
		const parsed = new URL(clean);
		if (parsed.hostname === 'blogger.googleusercontent.com') {
			// The /img/a/<token> form takes an inline directive suffix; -rw asks
			// for WebP. Use =s<n> (longest-dimension cap) rather than =w<n>: many
			// of these are very tall text images, and =w only caps width, leaving
			// the file huge. Strip any existing directive first (the match needs a
			// size letter + digit so it never clobbers base64 "=" padding).
			return `${clean.replace(/=[a-z]\d[a-z0-9-]*$/i, '')}=s${width}-rw`;
		}
		if (parsed.hostname === 'images.unsplash.com') {
			parsed.searchParams.set('w', String(width));
			parsed.searchParams.set('q', '70');
			parsed.searchParams.set('auto', 'format');
			return parsed.toString();
		}
		if (parsed.hostname === 's3.twcstorage.ru') {
			// Neobook CDN encodes the size as an `_s_`/`_m_`/`_l_` path segment.
			const segment = width <= 320 ? '_s_' : width <= 768 ? '_m_' : '_l_';
			return clean.replace(/_[sml]_/, segment);
		}
		return clean;
	} catch {
		return clean;
	}
}

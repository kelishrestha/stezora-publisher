/**
 * Sized variants for externally hosted featured images. Imported posts still
 * hotlink Blogger's CDN (and a couple of Unsplash originals, one of which is
 * an 8.8 MB JPEG), so cards must never load the full-size file. Both hosts
 * support resize hints; everything else passes through untouched. Proper
 * localization into R2 replaces this eventually.
 */
export function imageVariant(url: string, width: number): string {
	// Imported URLs came out of HTML attributes; undo entity-encoded ampersands.
	const clean = url.replace(/&amp;/g, '&');
	try {
		const parsed = new URL(clean);
		if (parsed.hostname === 'blogger.googleusercontent.com') {
			// The /img/a/<token> form takes an inline directive suffix; -rw asks
			// for WebP. Replace any existing directive.
			return `${clean.replace(/=w\d+[^/]*$/, '')}=w${width}-rw`;
		}
		if (parsed.hostname === 'images.unsplash.com') {
			parsed.searchParams.set('w', String(width));
			parsed.searchParams.set('q', '70');
			parsed.searchParams.set('auto', 'format');
			return parsed.toString();
		}
		return clean;
	} catch {
		return clean;
	}
}

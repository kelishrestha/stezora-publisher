/**
 * Display-time excerpt derived from post content HTML. The stored excerpt is
 * a hand-written summary and stays empty unless the author provides one
 * (imported Blogger posts have none); cards, feeds, and meta descriptions
 * fall back to this derived teaser.
 */
export function deriveExcerpt(contentHtml: string, maxLength = 180): string {
	const text = contentHtml
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (text.length <= maxLength) {
		return text;
	}
	const cut = text.slice(0, maxLength);
	const boundary = cut.lastIndexOf(' ');
	return `${(boundary > 0 ? cut.slice(0, boundary) : cut).trimEnd()}…`;
}

export function postExcerpt(data: { excerpt: string; content: string }): string {
	return data.excerpt || deriveExcerpt(data.content);
}

import sanitizeHtml from 'sanitize-html';

export const ALLOWED_TAGS = [
	'p',
	'div',
	'br',
	'strong',
	'em',
	'a',
	'ul',
	'ol',
	'li',
	'blockquote',
	'pre',
	'code',
	'h2',
	'h3',
	'h4',
	'hr',
	'img',
	'figure',
	'figcaption',
];

export const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions['allowedAttributes'] = {
	a: ['href', 'target', 'rel'],
	img: ['src', 'alt', 'width', 'height'],
};

export const ALLOWED_SCHEMES = ['http', 'https', 'mailto'];

export function sanitizeContentHtml(html: string): string {
	return sanitizeHtml(html, {
		allowedTags: ALLOWED_TAGS,
		allowedAttributes: ALLOWED_ATTRIBUTES,
		allowedSchemes: ALLOWED_SCHEMES,
		transformTags: {
			a: (tagName, attribs) => ({
				tagName,
				attribs: { ...attribs, rel: 'noopener noreferrer' },
			}),
		},
	});
}

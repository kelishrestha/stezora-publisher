import TurndownService from 'turndown';

/**
 * HTML to Markdown conversion for imported Blogger content (node-side only;
 * used by the D1 backfill). The inverse pipeline lives in
 * worker/lib/markdown.ts (markdown to sanitized HTML), so the two must agree
 * on hard line breaks: turndown emits trailing-double-space breaks for <br>,
 * which marked renders back to <br>. Blogger poems rely on this.
 */
const turndown = new TurndownService({
	headingStyle: 'atx',
	codeBlockStyle: 'fenced',
	bulletListMarker: '-',
	emDelimiter: '*',
});

const BLOCK_TAGS = new Set([
	'DIV',
	'P',
	'UL',
	'OL',
	'LI',
	'BLOCKQUOTE',
	'PRE',
	'TABLE',
	'FIGURE',
	'H1',
	'H2',
	'H3',
	'H4',
	'H5',
	'H6',
]);

function hasBlockChild(node: TurndownService.Node): boolean {
	for (const child of Array.from(node.childNodes)) {
		if (BLOCK_TAGS.has(child.nodeName)) {
			return true;
		}
	}
	return false;
}

// Blogger wraps each visual line in its own <div> (poems especially), which
// browsers render as tight lines. Turndown's default would promote each div
// to a paragraph, so the markdown round-trip (marked) would add paragraph
// spacing between lines. Emit inline-only divs as markdown hard line breaks
// instead; empty divs (<div><br /></div>) act as paragraph separators.
turndown.addRule('bloggerLineDivs', {
	filter: (node) => node.nodeName === 'DIV' && !hasBlockChild(node),
	replacement: (content) => {
		const line = content.replace(/\s+$/, '').replace(/^\n+/, '');
		return line ? `${line}  \n` : '\n\n';
	},
});

export function htmlToMarkdown(html: string): string {
	return turndown.turndown(html).trim();
}

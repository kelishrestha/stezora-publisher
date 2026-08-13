import { marked } from 'marked';
import { sanitizeContentHtml } from '../../src/lib/blogger/sanitize';

/**
 * Content pipeline shared by the editor, preview, and CMS writes
 * (DEVELOPER.md §83): markdown → HTML → sanitized HTML. Every content write
 * path runs through this function so imported HTML is never trusted stale.
 */
export function renderMarkdownToSanitizedHtml(markdown: string): string {
	const html = marked.parse(markdown, { async: false });
	return sanitizeContentHtml(html);
}
/**
 * Serializes an array of flat record objects to CSV. Columns are taken in the
 * order given (or discovered from the first row); values are escaped per RFC
 * 4180 (double the quotes, wrap anything with a comma, quote, or newline).
 * `null` and `undefined` render as an empty cell.
 */
export function toCsv(rows: Array<Record<string, unknown>>, columns?: string[]): string {
	const keys = columns ?? (rows[0] ? Object.keys(rows[0]) : []);
	const escape = (value: unknown): string => {
		if (value === null || value === undefined) return '';
		const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
		return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
	};
	const lines = [keys.join(',')];
	for (const row of rows) {
		lines.push(keys.map((key) => escape(row[key])).join(','));
	}
	return `${lines.join('\r\n')}\r\n`;
}

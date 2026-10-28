/** Shared bits for the admin list filter bars (posts, media). */

export const MONTHS = Array.from({ length: 12 }, (_, index) => ({
	value: String(index + 1).padStart(2, '0'),
	label: new Date(2000, index, 1).toLocaleDateString(undefined, { month: 'long' }),
}));

export const filterSelectClass =
	'mt-0.5 w-full rounded border-border bg-background text-foreground shadow-sm sm:text-sm focus:border-accent focus:ring-accent';

export function matchesMonthYear(date: Date | null, month: string, year: string): boolean {
	if (month === 'all' && year === 'all') return true;
	if (!date) return false;
	if (month !== 'all' && String(date.getMonth() + 1).padStart(2, '0') !== month) return false;
	return year === 'all' || String(date.getFullYear()) === year;
}

export function yearsOf(dates: Array<Date | null>): string[] {
	return [
		...new Set(dates.filter((date): date is Date => date !== null).map((date) => String(date.getFullYear()))),
	]
		.sort()
		.reverse();
}

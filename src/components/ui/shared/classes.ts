/**
 * Centralized HyperUI-derived class recipes on the theme tokens, shared by
 * the public Astro components and the admin React islands. Components should
 * compose these builders instead of repeating class strings, so a styling
 * decision changes in one place and follows every color scheme (site,
 * publication palettes, admin) through the tokens.
 */

export type ButtonVariant = 'primary' | 'brand' | 'outline' | 'accentOutline' | 'ghost' | 'danger' | 'dangerOutline';
export type ButtonSize = 'lg' | 'md' | 'sm' | 'xs' | 'icon';

const BUTTON_BASE = 'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
	primary:
		'bg-accent text-on-accent hover:opacity-90 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background',
	brand:
		'bg-primary text-on-primary hover:opacity-90 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background',
	outline: 'border border-border bg-surface text-foreground hover:bg-surface-elevated focus:ring-accent',
	ghost: 'bg-transparent text-muted-foreground hover:text-accent-foreground focus:ring-accent',
	accentOutline:
		'border border-accent bg-transparent text-accent-foreground hover:bg-accent hover:text-on-accent focus:ring-accent',
	danger: 'bg-red-600 text-red-50 hover:bg-red-700 focus:ring-red-500',
	dangerOutline:
		'border border-red-300 bg-red-50 text-red-700 hover:bg-red-600 hover:text-red-50 focus:ring-red-500 dark:border-red-900 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-700 dark:hover:text-red-50',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
	lg: 'px-5 py-2.5 text-sm',
	md: 'px-4 py-2 text-sm',
	sm: 'px-3 py-1.5 text-sm',
	xs: 'px-3 py-1.5 text-xs',
	icon: 'p-2',
};

export function buttonClass(variant: ButtonVariant, size: ButtonSize = 'md'): string {
	return `${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]}`;
}

export type BadgeTone = 'solid' | 'soft' | 'outline' | 'success' | 'muted';

const BADGE_BASE = 'rounded-full px-2.5 py-0.5 text-xs whitespace-nowrap';

const BADGE_TONES: Record<BadgeTone, string> = {
	solid: 'bg-accent text-on-accent',
	soft: 'bg-accent-soft text-accent-foreground',
	outline: 'border border-border text-muted-foreground',
	success: 'bg-emerald-100 font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
	muted: 'bg-muted font-medium text-muted-foreground',
};

export function badgeClass(tone: BadgeTone): string {
	return `${BADGE_BASE} ${BADGE_TONES[tone]}`;
}

/** Post status to badge tone: published pops in emerald, the rest stay muted. */
export function statusBadgeClass(status: string): string {
	if (status === 'published') return badgeClass('success');
	if (status === 'draft') return `${BADGE_BASE} bg-muted font-medium text-foreground`;
	return badgeClass('muted');
}

/** HyperUI form control (inputs, selects, textareas) on the forms plugin. */
export const formControlClass =
	'mt-0.5 w-full rounded border-border bg-background text-foreground shadow-sm sm:text-sm placeholder:text-muted-foreground focus:border-accent focus:ring-accent';

export interface CardOptions {
	/** Drop the border (tinted publication backgrounds read cleaner without it). */
	borderless?: boolean;
}

/** HyperUI card shell shared by public and admin surfaces. */
export function cardClass(options: CardOptions = {}): string {
	return `overflow-hidden rounded-md bg-surface shadow-sm ${options.borderless ? '' : 'border border-border'}`;
}

export type PaginationItemKind = 'page' | 'active' | 'arrow' | 'arrowDisabled';

/** HyperUI pagination items shared by the public nav and the admin control. */
export function paginationItemClass(kind: PaginationItemKind): string {
	const base = 'grid size-8 place-content-center rounded border text-sm font-medium';
	const kinds: Record<PaginationItemKind, string> = {
		page: 'border-border bg-surface text-foreground transition-colors hover:bg-surface-elevated',
		active: 'border-accent bg-accent text-on-accent',
		arrow: 'border-border bg-surface text-foreground transition-colors hover:bg-surface-elevated',
		arrowDisabled: 'border-border bg-surface text-muted-foreground opacity-50',
	};
	return `${base} ${kinds[kind]}`;
}

/** HyperUI table shell and cells (admin lists). */
export const tableClass = 'min-w-full divide-y-2 divide-border text-left text-sm';
export const tableCellClass = 'px-3 py-2 whitespace-nowrap';

/** Stat tiles (dashboard): accent-soft card with an accent label. */
export const statCardClass = 'rounded-md border border-border bg-secondary p-5 shadow-sm';
export const statCardLabelClass = 'text-sm font-medium text-on-secondary';
export const statCardValueClass = 'mt-1 text-3xl font-semibold text-foreground';

/** Modal overlay and panel shared by every dialog. */
export const modalOverlayClass =
	'fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm';
export function modalPanelClass(extra = 'w-full max-w-md p-5'): string {
	return `rounded-lg border border-border bg-surface shadow-lg ${extra}`;
}

/** Count pill on tabs (posts status tabs, tag publication tabs). */
export function countBadgeClass(active: boolean): string {
	return `rounded-full px-2 py-0.5 text-xs ${active ? 'bg-accent-soft text-accent-foreground' : 'bg-muted text-muted-foreground'}`;
}

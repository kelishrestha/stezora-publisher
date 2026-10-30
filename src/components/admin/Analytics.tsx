import { useEffect, useMemo, useRef, useState } from 'react';
import { cardClass, statCardClass, statCardLabelClass, statCardValueClass } from '../ui/shared/classes';

/**
 * Writer's Analytics: three charts built from content metadata only (there is
 * no traffic data). Charts are dependency-free inline SVG / themed HTML bars so
 * they render under the strict CSP with no charting library and adapt to light
 * and dark mode through the design tokens.
 */

interface StatusByPublication {
	slug: string;
	name: string;
	draft: number;
	scheduled: number;
	published: number;
	archived: number;
}

interface MonthPoint {
	month: string;
	count: number;
}

interface AnalyticsData {
	totals: {
		publications: number;
		posts: number;
		published: number;
		firstPublished: string | null;
		lastPublished: string | null;
	};
	statusByPublication: StatusByPublication[];
	postsByMonth: MonthPoint[];
	media: { total: number; localized: number; external: number; totalBytes: number };
}

type Status = 'published' | 'scheduled' | 'draft' | 'archived';

// Status order and colors. published/scheduled carry hue (good/upcoming);
// draft/archived are intentional neutrals (inactive states), separated by
// lightness. Validated with the dataviz palette checker (CVD deltaE ~12-13 for
// the chromatic pair); legend, direct labels, and 2px gaps provide the
// secondary encoding the neutral and low-contrast swatches require.
const STATUS_META: { key: Status; label: string; swatch: string }[] = [
	{ key: 'published', label: 'Published', swatch: 'bg-emerald-600 dark:bg-emerald-500' },
	{ key: 'scheduled', label: 'Scheduled', swatch: 'bg-amber-500 dark:bg-amber-400' },
	{ key: 'draft', label: 'Draft', swatch: 'bg-muted-foreground/40' },
	{ key: 'archived', label: 'Archived', swatch: 'bg-muted-foreground/75' },
];

const EMPTY = '–';

function formatBytes(bytes: number): string {
	if (!bytes) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB'];
	const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
	const value = bytes / 1024 ** exponent;
	return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function year(iso: string | null): string {
	return iso ? iso.slice(0, 4) : EMPTY;
}

/** Fills every month between the first and last data point so the cadence line is continuous. */
function fillMonths(points: MonthPoint[]): MonthPoint[] {
	if (points.length === 0) return [];
	const counts = new Map(points.map((p) => [p.month, p.count]));
	const [startY, startM] = points[0].month.split('-').map(Number);
	const [endY, endM] = points[points.length - 1].month.split('-').map(Number);
	const filled: MonthPoint[] = [];
	let y = startY;
	let m = startM;
	while (y < endY || (y === endY && m <= endM)) {
		const key = `${y}-${String(m).padStart(2, '0')}`;
		filled.push({ month: key, count: counts.get(key) ?? 0 });
		m += 1;
		if (m > 12) {
			m = 1;
			y += 1;
		}
	}
	return filled;
}

function monthLabel(month: string): string {
	const [y, m] = month.split('-').map(Number);
	const date = new Date(Date.UTC(y, m - 1, 1));
	return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

export default function Analytics() {
	const [data, setData] = useState<AnalyticsData | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			const response = await fetch('/api/admin/analytics', { credentials: 'same-origin' });
			if (response.status === 401) {
				window.location.href = '/admin/login';
				return;
			}
			if (!response.ok) throw new Error(`Failed to load analytics (HTTP ${response.status}).`);
			const body = (await response.json()) as { data: AnalyticsData };
			if (!cancelled) setData(body.data);
		}
		load().catch((reason: unknown) => {
			if (!cancelled) setError(reason instanceof Error ? reason.message : 'Failed to load analytics.');
		});
		return () => {
			cancelled = true;
		};
	}, []);

	if (error) {
		return <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-foreground">{error}</p>;
	}

	if (!data) {
		return (
			<div className="space-y-6">
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{[0, 1, 2, 3].map((i) => (
						<div key={i} className="h-28 animate-pulse rounded-md border border-border bg-surface shadow-sm" />
					))}
				</div>
				<div className="h-64 animate-pulse rounded-md border border-border bg-surface shadow-sm" />
			</div>
		);
	}

	const span =
		data.totals.firstPublished && data.totals.lastPublished
			? `${year(data.totals.firstPublished)}–${year(data.totals.lastPublished)}`
			: EMPTY;

	return (
		<div className="space-y-6">
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<StatTile label="Total posts" value={String(data.totals.posts)} />
				<StatTile label="Published" value={String(data.totals.published)} />
				<StatTile label="Publishing span" value={span} />
				<StatTile label="Media storage" value={formatBytes(data.media.totalBytes)} hint={`${data.media.total} files`} />
			</div>

			<StatusByPublicationChart rows={data.statusByPublication} />
			<CadenceChart points={data.postsByMonth} />
			<MediaChart media={data.media} />
		</div>
	);
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
	return (
		<div className={statCardClass}>
			<p className={statCardLabelClass}>{label}</p>
			<p className={statCardValueClass}>{value}</p>
			{hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
		</div>
	);
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
	return (
		<section className={cardClass()}>
			<div className="border-b border-border px-5 py-4">
				<h2 className="text-base font-semibold text-foreground">{title}</h2>
				{subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
			</div>
			<div className="p-5">{children}</div>
		</section>
	);
}

function StatusLegend() {
	return (
		<ul className="flex flex-wrap gap-x-4 gap-y-2">
			{STATUS_META.map((status) => (
				<li key={status.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<span className={`inline-block size-3 rounded-sm ${status.swatch}`} aria-hidden="true" />
					{status.label}
				</li>
			))}
		</ul>
	);
}

function StatusByPublicationChart({ rows }: { rows: StatusByPublication[] }) {
	const [showTable, setShowTable] = useState(false);
	const totals = rows.map((row) => row.draft + row.scheduled + row.published + row.archived);
	const maxTotal = Math.max(1, ...totals);

	return (
		<ChartCard title="Posts by status and publication" subtitle="Bar length is total posts; segments are the status mix.">
			<div className="flex items-center justify-between gap-4">
				<StatusLegend />
				<button
					type="button"
					onClick={() => setShowTable((value) => !value)}
					className="shrink-0 text-xs font-medium text-accent-foreground underline-offset-2 hover:underline"
					aria-expanded={showTable}
				>
					{showTable ? 'Show chart' : 'Show data'}
				</button>
			</div>

			{showTable ? (
				<div className="mt-4 overflow-x-auto">
					<table className="min-w-full divide-y divide-border text-left text-sm">
						<thead>
							<tr className="text-xs text-muted-foreground">
								<th className="px-2 py-2 font-medium">Publication</th>
								{STATUS_META.map((status) => (
									<th key={status.key} className="px-2 py-2 text-right font-medium">
										{status.label}
									</th>
								))}
								<th className="px-2 py-2 text-right font-medium">Total</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{rows.map((row, index) => (
								<tr key={row.slug}>
									<td className="px-2 py-2 font-medium text-foreground">{row.name}</td>
									{STATUS_META.map((status) => (
										<td key={status.key} className="px-2 py-2 text-right tabular-nums text-muted-foreground">
											{row[status.key]}
										</td>
									))}
									<td className="px-2 py-2 text-right font-medium tabular-nums text-foreground">{totals[index]}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<div className="mt-5 space-y-5">
					{rows.map((row, index) => {
						const total = totals[index];
						return (
							<div key={row.slug}>
								<div className="mb-1.5 flex items-baseline justify-between gap-3">
									<span className="truncate text-sm font-medium text-foreground">{row.name}</span>
									<span className="shrink-0 text-xs tabular-nums text-muted-foreground">{total} posts</span>
								</div>
								<div
									className="flex h-5 w-full gap-0.5 overflow-hidden rounded"
									role="img"
									aria-label={`${row.name}: ${STATUS_META.map((s) => `${row[s.key]} ${s.label.toLowerCase()}`).join(', ')}`}
								>
									{STATUS_META.map((status) => {
										const value = row[status.key];
										if (value === 0) return null;
										// Widths are relative to the largest publication total so the
										// bars compare across publications, not just within one.
										const width = (value / maxTotal) * 100;
										return (
											<div
												key={status.key}
												className={status.swatch}
												style={{ width: `${width}%` }}
												title={`${status.label}: ${value}`}
											/>
										);
									})}
								</div>
							</div>
						);
					})}
				</div>
			)}
		</ChartCard>
	);
}

function CadenceChart({ points }: { points: MonthPoint[] }) {
	const svgRef = useRef<SVGSVGElement | null>(null);
	const [hover, setHover] = useState<number | null>(null);
	const months = useMemo(() => fillMonths(points), [points]);

	const W = 820;
	const H = 240;
	const padL = 34;
	const padR = 14;
	const padT = 14;
	const padB = 26;
	const plotW = W - padL - padR;
	const plotH = H - padT - padB;

	const maxY = Math.max(1, ...months.map((m) => m.count));
	const stepX = months.length > 1 ? plotW / (months.length - 1) : 0;
	const x = (i: number) => padL + i * stepX;
	const y = (count: number) => padT + plotH - (count / maxY) * plotH;

	const linePath = months.map((m, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(m.count).toFixed(1)}`).join(' ');
	const areaPath = months.length
		? `${linePath} L${x(months.length - 1).toFixed(1)},${(padT + plotH).toFixed(1)} L${x(0).toFixed(1)},${(padT + plotH).toFixed(1)} Z`
		: '';

	// Year gridlines: the first month of each calendar year present in the data.
	const yearTicks = months
		.map((m, i) => ({ i, month: m.month }))
		.filter((t) => t.month.endsWith('-01') || t.i === 0)
		.filter((t, idx, arr) => arr.findIndex((o) => o.month.slice(0, 4) === t.month.slice(0, 4)) === idx);

	function handleMove(event: React.MouseEvent<SVGSVGElement>) {
		const svg = svgRef.current;
		if (!svg || months.length === 0) return;
		const rect = svg.getBoundingClientRect();
		const vbX = ((event.clientX - rect.left) / rect.width) * W;
		const i = Math.round((vbX - padL) / (stepX || 1));
		setHover(Math.max(0, Math.min(months.length - 1, i)));
	}

	const total = months.reduce((sum, m) => sum + m.count, 0);

	return (
		<ChartCard title="Publishing cadence" subtitle={`${total} published posts by month`}>
			{months.length === 0 ? (
				<p className="text-sm text-muted-foreground">No published posts yet.</p>
			) : (
				<div className="relative">
					<svg
						ref={svgRef}
						viewBox={`0 0 ${W} ${H}`}
						className="w-full"
						role="img"
						aria-label={`Posts published per month from ${monthLabel(months[0].month)} to ${monthLabel(months[months.length - 1].month)}`}
						onMouseMove={handleMove}
						onMouseLeave={() => setHover(null)}
					>
						{[0, 0.5, 1].map((frac) => {
							const gy = padT + plotH - frac * plotH;
							const value = Math.round(frac * maxY);
							return (
								<g key={frac}>
									<line x1={padL} y1={gy} x2={W - padR} y2={gy} className="stroke-border" strokeWidth={1} />
									<text x={padL - 6} y={gy + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">
										{value}
									</text>
								</g>
							);
						})}

						{yearTicks.map((tick) => (
							<text
								key={tick.month}
								x={x(tick.i)}
								y={H - 8}
								textAnchor="middle"
								className="fill-muted-foreground text-[10px]"
							>
								{tick.month.slice(0, 4)}
							</text>
						))}

						<path d={areaPath} className="fill-[var(--color-accent)]" fillOpacity={0.14} />
						<path d={linePath} fill="none" className="stroke-[var(--color-accent)]" strokeWidth={2} strokeLinejoin="round" />

						{hover !== null && (
							<g>
								<line
									x1={x(hover)}
									y1={padT}
									x2={x(hover)}
									y2={padT + plotH}
									className="stroke-[var(--color-accent)]"
									strokeWidth={1}
									strokeDasharray="3 3"
								/>
								<circle
									cx={x(hover)}
									cy={y(months[hover].count)}
									r={4}
									className="fill-[var(--color-accent)] stroke-surface"
									strokeWidth={2}
								/>
							</g>
						)}
					</svg>

					{hover !== null && (
						<div
							className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md border border-border bg-surface px-2 py-1 text-xs shadow-sm"
							style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(months[hover].count) / H) * 100}%` }}
						>
							<span className="font-medium text-foreground">{months[hover].count}</span>{' '}
							<span className="text-muted-foreground">{monthLabel(months[hover].month)}</span>
						</div>
					)}
				</div>
			)}
		</ChartCard>
	);
}

function MediaChart({ media }: { media: AnalyticsData['media'] }) {
	const { localized, external, total } = media;
	const [hover, setHover] = useState<'localized' | 'external' | null>(null);
	const localizedPct = total > 0 ? Math.round((localized / total) * 100) : 0;

	// Donut via a single circle with stroke-dasharray. Circumference split
	// between localized (accent) and external (neutral).
	const size = 160;
	const stroke = 22;
	const radius = (size - stroke) / 2;
	const circumference = 2 * Math.PI * radius;
	const localizedLen = total > 0 ? (localized / total) * circumference : 0;

	const segments: { key: 'localized' | 'external'; label: string; value: number; swatch: string }[] = [
		{ key: 'localized', label: 'Localized (R2)', value: localized, swatch: 'bg-[var(--color-accent)]' },
		{ key: 'external', label: 'External (Blogger)', value: external, swatch: 'bg-muted-foreground/30' },
	];

	return (
		<ChartCard title="Media storage" subtitle="How much media is localized into R2 versus still served from Blogger.">
			{total === 0 ? (
				<p className="text-sm text-muted-foreground">No media yet.</p>
			) : (
				<div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-10">
					<svg
						viewBox={`0 0 ${size} ${size}`}
						className="h-40 w-40 shrink-0 -rotate-90"
						role="img"
						aria-label={`${localizedPct}% of media localized into R2`}
					>
						<circle cx={size / 2} cy={size / 2} r={radius} fill="none" className="stroke-muted-foreground/30" strokeWidth={stroke} />
						<circle
							cx={size / 2}
							cy={size / 2}
							r={radius}
							fill="none"
							className="stroke-[var(--color-accent)]"
							strokeWidth={hover === 'localized' ? stroke + 2 : stroke}
							strokeDasharray={`${localizedLen} ${circumference - localizedLen}`}
						/>
						<text
							x={size / 2}
							y={size / 2 - 4}
							textAnchor="middle"
							className="fill-foreground text-[22px] font-semibold"
							transform={`rotate(90 ${size / 2} ${size / 2})`}
						>
							{localizedPct}%
						</text>
						<text
							x={size / 2}
							y={size / 2 + 16}
							textAnchor="middle"
							className="fill-muted-foreground text-[11px]"
							transform={`rotate(90 ${size / 2} ${size / 2})`}
						>
							localized
						</text>
					</svg>

					<ul className="w-full max-w-xs space-y-2">
						{segments.map((segment) => (
							<li
								key={segment.key}
								className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-elevated"
								onMouseEnter={() => setHover(segment.key)}
								onMouseLeave={() => setHover(null)}
							>
								<span className="flex items-center gap-2 text-sm text-foreground">
									<span className={`inline-block size-3 rounded-sm ${segment.swatch}`} aria-hidden="true" />
									{segment.label}
								</span>
								<span className="text-sm tabular-nums text-muted-foreground">
									{segment.value} ({total > 0 ? Math.round((segment.value / total) * 100) : 0}%)
								</span>
							</li>
						))}
						<li className="flex items-center justify-between gap-3 border-t border-border px-2 pt-2 text-sm">
							<span className="text-muted-foreground">Total stored</span>
							<span className="font-medium tabular-nums text-foreground">{formatBytes(media.totalBytes)}</span>
						</li>
					</ul>
				</div>
			)}
		</ChartCard>
	);
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { badgeClass, cardClass, statCardClass, statCardLabelClass, statCardValueClass } from '../ui/shared/classes';
import { filterSelectClass } from './filters';
import { formatDateTime } from '../../lib/admin/datetime';

/**
 * Audience analytics: first-party visitor data from the page_views table (no
 * third party, no traffic from admin pages). Optional ?publication= and ?post=
 * scope the whole view to one publication or one post. Charts are dependency-free
 * inline SVG / themed HTML so they stay CSP-safe in light and dark mode.
 */

interface DayPoint {
	day: string;
	views: number;
	visitors: number;
}

interface HourPoint {
	hour: string;
	views: number;
	visitors: number;
}

interface RecentVisit {
	createdAt: string;
	path: string;
	country: string | null;
	region: string | null;
	city: string | null;
	device: string | null;
	referrerHost: string | null;
}

interface RankRow {
	label: string;
	views: number;
	href?: string;
	external?: boolean;
}

interface PublicationOption {
	id: string;
	name: string;
	slug: string;
}

interface SourceHistoryPoint {
	capturedAt: string;
	app: number;
	blogger: number;
	neobook: number;
}

interface AudienceData {
	days: number;
	scope: { publication: string | null; post: string | null; publicationName: string | null; postTitle: string | null };
	totals: { pageviews: number; visitors: number; last24hPageviews: number; last24hVisitors: number };
	sources: { app: number; blogger: number; neobook: number };
	sourceHistory: SourceHistoryPoint[];
	bloggerPublications: Array<{ slug: string; name: string; viewsAll: number | null; views30d: number | null; views7d: number | null }>;
	neobookPosts: Array<{ title: string; publication: string; views: number | null; likes: number | null; comments: number | null }>;
	neobookBooks: Array<{ title: string; views: number | null; likes: number | null; comments: number | null; linkUrl: string | null }>;
	viewsByDay: DayPoint[];
	viewsByHour: HourPoint[];
	topCountries: Array<{ country: string | null; views: number }>;
	topReferrers: Array<{ host: string | null; views: number }>;
	topPublications: Array<{ publication: string | null; name: string | null; views: number }>;
	topPosts: Array<{ publication: string | null; slug: string | null; title: string | null; views: number }>;
	recentVisits: RecentVisit[];
}

type SourceKey = 'app' | 'blogger' | 'neobook';

/**
 * The three content sources. app uses the brand accent; blogger and neobook use
 * emerald and amber (theme-sanctioned, distinct hues). A legend always pairs the
 * color with a text label so identity is never color-alone.
 */
const SOURCES: Array<{ key: SourceKey; label: string; imported: boolean; stroke: string; fill: string; dot: string }> = [
	{ key: 'app', label: 'This app', imported: false, stroke: 'stroke-[var(--color-accent)]', fill: 'fill-[var(--color-accent)]', dot: 'bg-[var(--color-accent)]' },
	{ key: 'blogger', label: 'Blogger', imported: true, stroke: 'stroke-emerald-500', fill: 'fill-emerald-500', dot: 'bg-emerald-500' },
	{ key: 'neobook', label: 'Neobook', imported: true, stroke: 'stroke-amber-500', fill: 'fill-amber-500', dot: 'bg-amber-500' },
];

const RANGES = [
	{ value: 7, label: 'Last 7 days' },
	{ value: 30, label: 'Last 30 days' },
	{ value: 90, label: 'Last 90 days' },
];

const regionNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;

function countryName(code: string | null): string {
	if (!code) return 'Unknown';
	try {
		return regionNames?.of(code) ?? code;
	} catch {
		return code;
	}
}

function flag(code: string | null): string {
	if (!code || code.length !== 2) return '🌐';
	const base = 0x1f1e6;
	return String.fromCodePoint(base + (code.charCodeAt(0) - 65), base + (code.charCodeAt(1) - 65));
}

function formatNumber(value: number): string {
	return value.toLocaleString();
}

function placeLabel(visit: RecentVisit): string {
	return [visit.city, visit.region, countryName(visit.country)].filter(Boolean).join(', ') || 'Unknown';
}

function audienceHref(publication?: string | null, post?: string | null): string {
	const params = new URLSearchParams();
	if (publication) params.set('publication', publication);
	if (post) params.set('post', post);
	const query = params.toString();
	return query ? `/admin/audience?${query}` : '/admin/audience';
}

export default function Audience() {
	const [post] = useState(() => {
		if (typeof window === 'undefined') return '';
		return new URLSearchParams(window.location.search).get('post') ?? '';
	});
	const [publication, setPublication] = useState(() => {
		if (typeof window === 'undefined') return '';
		return new URLSearchParams(window.location.search).get('publication') ?? '';
	});
	const [publications, setPublications] = useState<PublicationOption[]>([]);
	const [days, setDays] = useState(30);
	const [source, setSource] = useState<SourceKey>('app');
	const [data, setData] = useState<AudienceData | null>(null);
	const [error, setError] = useState<string | null>(null);

	// Publication list for the filter dropdown.
	useEffect(() => {
		let cancelled = false;
		fetch('/api/admin/posts/meta', { credentials: 'same-origin' })
			.then((response) => (response.ok ? (response.json() as Promise<{ data: { publications: PublicationOption[] } }>) : null))
			.then((body) => {
				if (!cancelled && body) setPublications(body.data.publications);
			})
			.catch(() => undefined);
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		let cancelled = false;
		setData(null);
		async function load() {
			const params = new URLSearchParams({ days: String(days) });
			if (publication) params.set('publication', publication);
			if (post) params.set('post', post);
			const response = await fetch(`/api/admin/audience?${params}`, { credentials: 'same-origin' });
			if (response.status === 401) {
				window.location.href = '/admin/login';
				return;
			}
			if (!response.ok) throw new Error(`Failed to load audience (HTTP ${response.status}).`);
			const body = (await response.json()) as { data: AudienceData };
			if (!cancelled) setData(body.data);
		}
		load().catch((reason: unknown) => {
			if (!cancelled) setError(reason instanceof Error ? reason.message : 'Failed to load audience.');
		});
		return () => {
			cancelled = true;
		};
	}, [days, publication, post]);

	// Keep the URL in sync so the view is shareable and the drill-down links stay coherent.
	function changePublication(value: string) {
		setPublication(value);
		if (typeof window === 'undefined') return;
		const params = new URLSearchParams(window.location.search);
		params.delete('post');
		if (value) params.set('publication', value);
		else params.delete('publication');
		const query = params.toString();
		window.history.replaceState(null, '', query ? `/admin/audience?${query}` : '/admin/audience');
	}

	if (error) {
		return <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-foreground">{error}</p>;
	}

	const scopedToPost = Boolean(post);
	const scopedToPublication = Boolean(publication);
	const firstPartyEmpty = Boolean(data && data.totals.pageviews === 0);
	// A per-post view is first-party only; otherwise the dropdown picks the source.
	const activeSource: SourceKey = scopedToPost ? 'app' : source;

	const noDataCard = (
		<div className={cardClass()}>
			<p className="px-5 py-16 text-center text-sm text-muted-foreground">
				No visits recorded yet{scopedToPost || scopedToPublication ? ' for this selection' : ''}. Data appears here once the site receives traffic (admin pages are never tracked).
			</p>
		</div>
	);

	return (
		<div className="space-y-6">
			{scopedToPost ? (
				<>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<a href="/admin/audience" className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-foreground hover:underline">
							<span aria-hidden="true">&larr;</span> All audience
						</a>
						<RangeSelect days={days} onChange={setDays} />
					</div>
					{data?.scope.postTitle && (
						<p className="text-sm text-muted-foreground">
							Showing analytics for <span className="font-medium text-foreground">{data.scope.postTitle}</span>
							{data.scope.publicationName ? ` in ${data.scope.publicationName}` : ''}.
						</p>
					)}
				</>
			) : (
				<>
					<SourceComparison sources={data?.sources ?? null} active={activeSource} onSelect={setSource} />
					{activeSource !== 'neobook' && (
						<div className="flex flex-wrap items-center gap-3">
							<label htmlFor="publication" className="block w-56">
								<span className="sr-only">Publication</span>
								<select id="publication" value={publication} onChange={(event) => changePublication(event.target.value)} className={filterSelectClass}>
									<option value="">All publications</option>
									{publications.map((option) => (
										<option key={option.slug} value={option.slug}>
											{option.name}
										</option>
									))}
								</select>
							</label>
							<RangeSelect days={days} onChange={setDays} />
						</div>
					)}
				</>
			)}

			{!data ? (
				<SkeletonBlocks />
			) : scopedToPost ? (
				firstPartyEmpty ? (
					noDataCard
				) : (
					<FirstPartySections data={data} scopedToPost scopedToPublication={scopedToPublication} />
				)
			) : (
				<>
					<SourceTrend history={data.sourceHistory} />
					{activeSource === 'blogger' ? (
						<BloggerSourceDetail publications={data.bloggerPublications} publication={publication} days={days} />
					) : activeSource === 'neobook' ? (
						<NeobookSourceDetail posts={data.neobookPosts} books={data.neobookBooks} />
					) : firstPartyEmpty ? (
						noDataCard
					) : (
						<FirstPartySections data={data} scopedToPost={false} scopedToPublication={scopedToPublication} />
					)}
				</>
			)}
		</div>
	);
}

function RangeSelect({ days, onChange }: { days: number; onChange: (value: number) => void }) {
	return (
		<label htmlFor="range" className="block w-44">
			<span className="sr-only">Date range</span>
			<select id="range" value={days} onChange={(event) => onChange(Number(event.target.value))} className={filterSelectClass}>
				{RANGES.map((range) => (
					<option key={range.value} value={range.value}>
						{range.label}
					</option>
				))}
			</select>
		</label>
	);
}

function FirstPartySections({ data, scopedToPost, scopedToPublication }: { data: AudienceData; scopedToPost: boolean; scopedToPublication: boolean }) {
	return (
		<>
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<StatTile label="Pageviews" value={formatNumber(data.totals.pageviews)} hint={`last ${data.days} days shown below`} />
				<StatTile label="Unique visitors" value={formatNumber(data.totals.visitors)} hint="all time" />
				<StatTile label="Views (24h)" value={formatNumber(data.totals.last24hPageviews)} />
				<StatTile label="Visitors (24h)" value={formatNumber(data.totals.last24hVisitors)} />
			</div>

			<ViewsOverTime daily={data.viewsByDay} hourly={data.viewsByHour} days={data.days} />

			{!scopedToPost &&
				(scopedToPublication ? (
					<BarListCard
						title="Top posts"
						rows={data.topPosts.map((row) => ({
							label: row.title ?? `${row.publication ?? ''}/${row.slug ?? ''}`,
							views: row.views,
							href: row.publication && row.slug ? audienceHref(row.publication, row.slug) : undefined,
						}))}
						emptyLabel="No post views yet."
					/>
				) : (
					<div className="grid gap-6 lg:grid-cols-2">
						<BarListCard
							title="Top publications"
							rows={data.topPublications.map((row) => ({
								label: row.name ?? row.publication ?? 'Unknown',
								views: row.views,
								href: row.publication ? audienceHref(row.publication) : undefined,
							}))}
							emptyLabel="No publication views yet."
						/>
						<BarListCard
							title="Top posts"
							rows={data.topPosts.map((row) => ({
								label: row.title ?? `${row.publication ?? ''}/${row.slug ?? ''}`,
								views: row.views,
								href: row.publication && row.slug ? audienceHref(row.publication, row.slug) : undefined,
							}))}
							emptyLabel="No post views yet."
						/>
					</div>
				))}

			<div className="grid gap-6 lg:grid-cols-2">
				<BarListCard
					title="Top countries"
					rows={data.topCountries.map((row) => ({ label: `${flag(row.country)}  ${countryName(row.country)}`, views: row.views }))}
					emptyLabel="No geography yet."
				/>
				<BarListCard
					title="Top referrers"
					rows={data.topReferrers.map((row) => ({ label: row.host ?? 'Direct / none', views: row.views }))}
					emptyLabel="No referrers yet."
				/>
			</div>

			<RecentVisitsCard visits={data.recentVisits} />
		</>
	);
}

function snapshotLabel(iso: string): string {
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function SourceComparison({ sources, active, onSelect }: { sources: { app: number; blogger: number; neobook: number } | null; active: SourceKey; onSelect: (source: SourceKey) => void }) {
	return (
		<section className={cardClass()}>
			<div className="border-b border-border px-5 py-4">
				<h2 className="text-base font-semibold text-foreground">Views by source</h2>
				<p className="mt-0.5 text-xs text-muted-foreground">Total views across all content sources. Pick one to see its detail below.</p>
			</div>
			<fieldset className="grid gap-px bg-border sm:grid-cols-3">
				<legend className="sr-only">Content source</legend>
				{SOURCES.map((meta) => (
					<label
						key={meta.key}
						className="flex cursor-pointer flex-col gap-1 bg-surface px-5 py-4 transition-colors hover:bg-surface-elevated has-[:checked]:bg-accent-soft has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-accent"
					>
						<input type="radio" name="audience-source" value={meta.key} checked={active === meta.key} onChange={() => onSelect(meta.key)} className="sr-only" />
						<span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
							<span className={`inline-block size-2.5 rounded-full ${meta.dot}`} aria-hidden="true" />
							{meta.label}
							{meta.imported && <span className={badgeClass('muted')}>Imported</span>}
						</span>
						<span className="text-2xl font-semibold tabular-nums text-foreground">{sources ? formatNumber(sources[meta.key]) : '…'}</span>
					</label>
				))}
			</fieldset>
		</section>
	);
}

function SourceTrend({ history }: { history: SourceHistoryPoint[] }) {
	if (history.length < 2) {
		return (
			<ChartCard title="Aggregate views over time" subtitle="Cumulative total views per source">
				<p className="text-sm text-muted-foreground">
					The trend appears once a few snapshots are recorded. Each Blogger stats refresh and Neobook sync captures one.
				</p>
			</ChartCard>
		);
	}

	const W = 760;
	const H = 240;
	const padL = 44;
	const padR = 48;
	const padT = 12;
	const padB = 28;
	const plotW = W - padL - padR;
	const plotH = H - padT - padB;
	const n = history.length;
	const maxY = Math.max(1, ...history.flatMap((point) => [point.app, point.blogger, point.neobook]));
	const x = (i: number) => padL + (i / (n - 1)) * plotW;
	const y = (value: number) => padT + plotH - (value / maxY) * plotH;
	const pathFor = (key: SourceKey) => history.map((point, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(point[key]).toFixed(1)}`).join(' ');
	const tickIdx = Array.from(new Set([0, Math.floor((n - 1) / 2), n - 1]));

	const legend = (
		<div className="flex flex-wrap gap-3">
			{SOURCES.map((meta) => (
				<span key={meta.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<span className={`inline-block size-2.5 rounded-full ${meta.dot}`} aria-hidden="true" />
					{meta.label}
				</span>
			))}
		</div>
	);

	return (
		<ChartCard title="Aggregate views over time" subtitle="Cumulative total views per source" action={legend}>
			<svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Cumulative views per source over time">
				{[0, 0.5, 1].map((frac) => {
					const gy = padT + plotH - frac * plotH;
					return (
						<g key={frac}>
							<line x1={padL} y1={gy} x2={W - padR} y2={gy} className="stroke-border" strokeWidth={1} />
							<text x={padL - 6} y={gy + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">
								{Math.round(frac * maxY)}
							</text>
						</g>
					);
				})}
				{tickIdx.map((i) => (
					<text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[10px]">
						{snapshotLabel(history[i].capturedAt)}
					</text>
				))}
				{SOURCES.map((meta) => (
					<path key={meta.key} d={pathFor(meta.key)} fill="none" className={meta.stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
				))}
				{SOURCES.map((meta) => (
					<text key={`${meta.key}-end`} x={x(n - 1) + 4} y={y(history[n - 1][meta.key]) + 3} className={`${meta.fill} text-[10px] font-medium`}>
						{formatNumber(history[n - 1][meta.key])}
					</text>
				))}
			</svg>
		</ChartCard>
	);
}

function bloggerBucket(days: number): { key: 'views7d' | 'views30d' | 'viewsAll'; label: string } {
	if (days <= 7) return { key: 'views7d', label: 'Views (7 days)' };
	if (days <= 30) return { key: 'views30d', label: 'Views (30 days)' };
	return { key: 'viewsAll', label: 'Views (all time)' };
}

function BloggerSourceDetail({ publications, publication, days }: { publications: AudienceData['bloggerPublications']; publication: string; days: number }) {
	const bucket = bloggerBucket(days);
	const rows = publication ? publications.filter((row) => row.slug === publication) : publications;
	return (
		<section className={cardClass()}>
			<div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
				<div>
					<h2 className="text-base font-semibold text-foreground">Blogger pageviews</h2>
					<p className="mt-0.5 text-xs text-muted-foreground">Blog-level totals from Blogger. Refresh them on the integrations page.</p>
				</div>
				<span className={badgeClass('muted')}>Imported</span>
			</div>
			{rows.length === 0 ? (
				<p className="px-5 py-10 text-center text-sm text-muted-foreground">
					{publications.length === 0 ? 'No Blogger statistics yet. Use Refresh stats on the integrations page.' : 'No Blogger statistics for this publication.'}
				</p>
			) : (
				<div className="overflow-x-auto">
					<table className="min-w-full divide-y divide-border text-left text-sm">
						<thead>
							<tr className="text-xs text-muted-foreground">
								<th className="px-5 py-2 font-medium">Publication</th>
								<th className="px-5 py-2 text-right font-medium">{bucket.label}</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{rows.map((row) => (
								<tr key={row.slug}>
									<td className="px-5 py-2 font-medium text-foreground">{row.name}</td>
									<td className="px-5 py-2 text-right tabular-nums text-muted-foreground">{row[bucket.key]?.toLocaleString() ?? '–'}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			<p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">Geography, referrers, and per-visit detail are available for first-party analytics only.</p>
		</section>
	);
}

function NeobookSourceDetail({ posts, books }: { posts: AudienceData['neobookPosts']; books: AudienceData['neobookBooks'] }) {
	const empty = posts.length === 0 && books.length === 0;
	return (
		<section className="space-y-6">
			<div className={`${cardClass()} flex items-center justify-between gap-3 px-5 py-4`}>
				<div>
					<h2 className="text-base font-semibold text-foreground">Neobook engagement</h2>
					<p className="mt-0.5 text-xs text-muted-foreground">Per-item view counts from Neobook, refreshed on each sync.</p>
				</div>
				<span className={badgeClass('muted')}>Imported</span>
			</div>
			{empty ? (
				<div className={cardClass()}>
					<p className="px-5 py-10 text-center text-sm text-muted-foreground">No Neobook items yet. Run a sync from the integrations page.</p>
				</div>
			) : (
				<div className="grid gap-6 lg:grid-cols-2">
					<BarListCard title="Poems by views" rows={posts.map((row) => ({ label: row.title, views: row.views ?? 0 }))} emptyLabel="No poems synced yet." />
					<BarListCard
						title="Books by views"
						rows={books.map((row) => ({ label: row.title, views: row.views ?? 0, href: row.linkUrl ?? undefined, external: true }))}
						emptyLabel="No books synced yet."
					/>
				</div>
			)}
		</section>
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

function ChartCard({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
	return (
		<section className={cardClass()}>
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
				<div>
					<h2 className="text-base font-semibold text-foreground">{title}</h2>
					{subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
				</div>
				{action}
			</div>
			<div className="p-5">{children}</div>
		</section>
	);
}

function SkeletonBlocks() {
	return (
		<div className="space-y-6">
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{[0, 1, 2, 3].map((i) => (
					<div key={i} className="h-24 animate-pulse rounded-md border border-border bg-surface shadow-sm" />
				))}
			</div>
			<div className="h-64 animate-pulse rounded-md border border-border bg-surface shadow-sm" />
		</div>
	);
}

function fillDays(points: DayPoint[], days: number): DayPoint[] {
	const byDay = new Map(points.map((p) => [p.day, p]));
	const out: DayPoint[] = [];
	const end = points.length > 0 ? new Date(`${points[points.length - 1].day}T00:00:00Z`) : new Date();
	for (let i = days - 1; i >= 0; i -= 1) {
		const d = new Date(end.getTime() - i * 86_400_000);
		const key = d.toISOString().slice(0, 10);
		out.push(byDay.get(key) ?? { day: key, views: 0, visitors: 0 });
	}
	return out;
}

interface SeriesPoint {
	key: string;
	views: number;
	visitors: number;
}

/** Fills the last 24 hourly buckets (UTC) so the hourly line is continuous. */
function fillHours(points: HourPoint[]): SeriesPoint[] {
	const byHour = new Map(points.map((p) => [p.hour, p]));
	const out: SeriesPoint[] = [];
	const now = new Date();
	now.setUTCMinutes(0, 0, 0);
	for (let i = 23; i >= 0; i -= 1) {
		const d = new Date(now.getTime() - i * 3_600_000);
		const key = d.toISOString().slice(0, 13);
		const found = byHour.get(key);
		out.push({ key, views: found?.views ?? 0, visitors: found?.visitors ?? 0 });
	}
	return out;
}

function dayLabel(dayKey: string): string {
	const date = new Date(`${dayKey}T00:00:00Z`);
	return Number.isNaN(date.getTime()) ? dayKey : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function tickLabel(key: string, mode: 'daily' | 'hourly'): string {
	return mode === 'hourly' ? `${key.slice(11, 13)}:00` : dayLabel(key);
}

function tooltipLabel(key: string, mode: 'daily' | 'hourly'): string {
	return mode === 'hourly' ? `${key.slice(11, 13)}:00, ${dayLabel(key.slice(0, 10))}` : dayLabel(key);
}

function ViewsOverTime({ daily, hourly, days }: { daily: DayPoint[]; hourly: HourPoint[]; days: number }) {
	const svgRef = useRef<SVGSVGElement | null>(null);
	const [hover, setHover] = useState<number | null>(null);
	const [mode, setMode] = useState<'daily' | 'hourly'>('daily');

	const series = useMemo<SeriesPoint[]>(
		() => (mode === 'hourly' ? fillHours(hourly) : fillDays(daily, days).map((d) => ({ key: d.day, views: d.views, visitors: d.visitors }))),
		[mode, hourly, daily, days]
	);

	const W = 820;
	const H = 220;
	const padL = 34;
	const padR = 14;
	const padT = 14;
	const padB = 24;
	const plotW = W - padL - padR;
	const plotH = H - padT - padB;
	const maxY = Math.max(1, ...series.map((d) => d.views));
	const stepX = series.length > 1 ? plotW / (series.length - 1) : 0;
	const x = (i: number) => padL + i * stepX;
	const y = (v: number) => padT + plotH - (v / maxY) * plotH;

	const line = series.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.views).toFixed(1)}`).join(' ');
	const area = series.length
		? `${line} L${x(series.length - 1).toFixed(1)},${(padT + plotH).toFixed(1)} L${x(0).toFixed(1)},${(padT + plotH).toFixed(1)} Z`
		: '';
	const total = series.reduce((sum, d) => sum + d.views, 0);

	// Up to six evenly spaced x-axis ticks.
	const tickCount = Math.min(6, series.length);
	const ticks = Array.from({ length: tickCount }, (_, k) => {
		const i = tickCount > 1 ? Math.round((k / (tickCount - 1)) * (series.length - 1)) : 0;
		return { i, label: tickLabel(series[i].key, mode) };
	});

	function handleMove(event: React.MouseEvent<SVGSVGElement>) {
		const svg = svgRef.current;
		if (!svg || series.length === 0) return;
		const rect = svg.getBoundingClientRect();
		const vbX = ((event.clientX - rect.left) / rect.width) * W;
		const i = Math.round((vbX - padL) / (stepX || 1));
		setHover(Math.max(0, Math.min(series.length - 1, i)));
	}

	const activeTab = 'rounded px-2.5 py-1 font-medium bg-accent text-on-accent';
	const inactiveTab = 'rounded px-2.5 py-1 font-medium text-muted-foreground hover:text-foreground';
	const toggle = (
		<div className="inline-flex rounded-md border border-border p-0.5 text-xs">
			<button type="button" onClick={() => setMode('daily')} className={mode === 'daily' ? activeTab : inactiveTab} aria-pressed={mode === 'daily'}>
				Daily
			</button>
			<button type="button" onClick={() => setMode('hourly')} className={mode === 'hourly' ? activeTab : inactiveTab} aria-pressed={mode === 'hourly'}>
				Last 24 hours
			</button>
		</div>
	);

	const subtitle = mode === 'hourly' ? `${formatNumber(total)} pageviews in the last 24 hours` : `${formatNumber(total)} pageviews in the last ${days} days`;

	return (
		<ChartCard title="Views over time" subtitle={subtitle} action={toggle}>
			<div className="relative">
				<svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={mode === 'hourly' ? 'Pageviews per hour, last 24 hours' : 'Pageviews per day'} onMouseMove={handleMove} onMouseLeave={() => setHover(null)}>
					{[0, 0.5, 1].map((frac) => {
						const gy = padT + plotH - frac * plotH;
						return (
							<g key={frac}>
								<line x1={padL} y1={gy} x2={W - padR} y2={gy} className="stroke-border" strokeWidth={1} />
								<text x={padL - 6} y={gy + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">
									{Math.round(frac * maxY)}
								</text>
							</g>
						);
					})}
					{ticks.map((tick) => (
						<text key={tick.i} x={x(tick.i)} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[10px]">
							{tick.label}
						</text>
					))}
					<path d={area} className="fill-[var(--color-accent)]" fillOpacity={0.14} />
					<path d={line} fill="none" className="stroke-[var(--color-accent)]" strokeWidth={2} strokeLinejoin="round" />
					{hover !== null && (
						<g>
							<line x1={x(hover)} y1={padT} x2={x(hover)} y2={padT + plotH} className="stroke-[var(--color-accent)]" strokeWidth={1} strokeDasharray="3 3" />
							<circle cx={x(hover)} cy={y(series[hover].views)} r={4} className="fill-[var(--color-accent)] stroke-surface" strokeWidth={2} />
						</g>
					)}
				</svg>
				{hover !== null && (
					<div
						className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md border border-border bg-surface px-2 py-1 text-xs shadow-sm"
						style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(series[hover].views) / H) * 100}%` }}
					>
						<span className="font-medium text-foreground">{series[hover].views}</span>{' '}
						<span className="text-muted-foreground">views, {series[hover].visitors} visitors</span>
						<span className="ml-1 text-muted-foreground">({tooltipLabel(series[hover].key, mode)})</span>
					</div>
				)}
			</div>
		</ChartCard>
	);
}

function BarListCard({ title, rows, emptyLabel }: { title: string; rows: RankRow[]; emptyLabel: string }) {
	const max = Math.max(1, ...rows.map((r) => r.views));
	return (
		<ChartCard title={title}>
			{rows.length === 0 ? (
				<p className="text-sm text-muted-foreground">{emptyLabel}</p>
			) : (
				<ul className="space-y-2.5">
					{rows.map((row, index) => (
						<li key={`${row.label}-${index}`}>
							<div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
								{row.href ? (
									<a
										href={row.href}
										target={row.external ? '_blank' : undefined}
										rel={row.external ? 'noopener' : undefined}
										className="truncate text-foreground hover:text-accent-foreground hover:underline"
									>
										{row.label}
									</a>
								) : (
									<span className="truncate text-foreground">{row.label}</span>
								)}
								<span className="shrink-0 tabular-nums text-muted-foreground">{formatNumber(row.views)}</span>
							</div>
							<div className="h-2 w-full overflow-hidden rounded-full bg-muted">
								<div className="h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${(row.views / max) * 100}%` }} />
							</div>
						</li>
					))}
				</ul>
			)}
		</ChartCard>
	);
}

function RecentVisitsCard({ visits }: { visits: RecentVisit[] }) {
	return (
		<ChartCard title="Recent visits" subtitle="Most recent pageviews with time and location.">
			{visits.length === 0 ? (
				<p className="text-sm text-muted-foreground">No visits yet.</p>
			) : (
				<div className="overflow-x-auto">
					<table className="min-w-full divide-y divide-border text-left text-sm">
						<thead>
							<tr className="text-xs text-muted-foreground">
								<th className="px-2 py-2 font-medium">When</th>
								<th className="px-2 py-2 font-medium">Location</th>
								<th className="px-2 py-2 font-medium">Page</th>
								<th className="px-2 py-2 font-medium">Device</th>
								<th className="px-2 py-2 font-medium">Referrer</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{visits.map((visit, index) => (
								<tr key={`${visit.createdAt}-${index}`}>
									<td className="whitespace-nowrap px-2 py-2 tabular-nums text-muted-foreground">{formatDateTime(visit.createdAt)}</td>
									<td className="px-2 py-2 text-foreground">
										{flag(visit.country)} {placeLabel(visit)}
									</td>
									<td className="max-w-[16rem] truncate px-2 py-2 text-muted-foreground" title={visit.path}>{visit.path}</td>
									<td className="px-2 py-2 capitalize text-muted-foreground">{visit.device ?? '–'}</td>
									<td className="px-2 py-2 text-muted-foreground">{visit.referrerHost ?? 'Direct'}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</ChartCard>
	);
}

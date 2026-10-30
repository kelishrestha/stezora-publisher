import { useEffect, useState } from 'react';
import EmptyState from './EmptyState';
import LoadingImage from './LoadingImage';
import { EyeIcon, ImagePlaceholderIcon, PencilIcon } from './icons';
import { badgeClass, buttonClass, cardClass, statusBadgeClass } from '../ui/shared/classes';

interface PublicationStats {
	slug: string;
	name: string;
	draft: number;
	scheduled: number;
	published: number;
	archived: number;
}

interface ListPost {
	id: string;
	title: string;
	slug: string;
	publication: string;
	status: string;
	publishedAt: string | null;
	updatedAt: string | null;
	featuredImage: { id: string; url: string; filename: string } | null;
}

interface PublicationOption {
	id: string;
	name: string;
	slug: string;
}

interface Stats {
	publications: PublicationStats[];
}

const STATUS_LABELS: Record<string, string> = {
	draft: 'Draft',
	scheduled: 'Scheduled',
	published: 'Published',
	archived: 'Archived',
};

function formatDate(value: string | null): string {
	if (!value) return '–';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function Dashboard() {
	const [stats, setStats] = useState<Stats | null>(null);
	const [drafts, setDrafts] = useState<ListPost[] | null>(null);
	const [scheduled, setScheduled] = useState<ListPost[] | null>(null);
	const [recent, setRecent] = useState<ListPost[] | null>(null);
	const [publicationNames, setPublicationNames] = useState<Record<string, string>>({});
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		async function request<T>(url: string): Promise<T | null> {
			const response = await fetch(url, { credentials: 'same-origin' });
			if (response.status === 401) {
				window.location.href = '/admin/login';
				return null;
			}
			if (!response.ok) {
				throw new Error(`Failed to load the dashboard (HTTP ${response.status}).`);
			}
			const body = (await response.json()) as { data: T };
			return body.data;
		}

		async function load() {
			const [statsData, draftsData, scheduledData, recentData, meta] = await Promise.all([
				request<Stats>('/api/admin/stats'),
				request<{ posts: ListPost[] }>('/api/admin/posts?status=draft&limit=5'),
				request<{ posts: ListPost[] }>('/api/admin/posts?status=scheduled&limit=50'),
				request<{ posts: ListPost[] }>('/api/admin/posts?limit=8'),
				request<{ publications: PublicationOption[] }>('/api/admin/posts/meta').catch(() => null),
			]);
			if (cancelled || !statsData || !draftsData || !scheduledData || !recentData) return;
			setStats(statsData);
			setDrafts(draftsData.posts);
			// Upcoming first: the API has no ascending sort, so order by date here.
			setScheduled(
				[...scheduledData.posts]
					.sort((a, b) => (a.publishedAt ?? '').localeCompare(b.publishedAt ?? ''))
					.slice(0, 5)
			);
			setRecent(recentData.posts);
			if (meta) {
				setPublicationNames(
					Object.fromEntries(meta.publications.flatMap((p) => [[p.slug, p.name], [p.id, p.name]]))
				);
			}
		}

		load().catch((reason: unknown) => {
			if (!cancelled) setError(reason instanceof Error ? reason.message : 'Failed to load the dashboard.');
		});

		return () => {
			cancelled = true;
		};
	}, []);

	if (error) {
		return <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-foreground">{error}</p>;
	}

	if (!stats || !drafts || !scheduled || !recent) {
		return (
			<div className="space-y-6">
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{[0, 1, 2, 3].map((i) => (
						<div key={i} className="h-24 animate-pulse rounded-md border border-border bg-surface shadow-sm" />
					))}
				</div>
				<div className="grid gap-6 lg:grid-cols-2">
					<div className="h-56 animate-pulse rounded-md border border-border bg-surface shadow-sm" />
					<div className="h-56 animate-pulse rounded-md border border-border bg-surface shadow-sm" />
				</div>
			</div>
		);
	}

	const totals = stats.publications.reduce(
		(acc, p) => ({
			draft: acc.draft + p.draft,
			scheduled: acc.scheduled + p.scheduled,
			published: acc.published + p.published,
			total: acc.total + p.draft + p.scheduled + p.published + p.archived,
		}),
		{ draft: 0, scheduled: 0, published: 0, total: 0 }
	);

	const publicationName = (slug: string): string => publicationNames[slug] ?? slug;

	return (
		<div className="space-y-6">
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<CountTile label="Drafts" value={totals.draft} caption="in progress" href="/admin/posts?status=draft" />
				<CountTile label="Scheduled" value={totals.scheduled} caption="upcoming" href="/admin/posts?status=scheduled" />
				<CountTile label="Published" value={totals.published} caption="live" href="/admin/posts?status=published" />
				<CountTile label="Total posts" value={totals.total} caption="all statuses" href="/admin/posts" />
			</div>

			<div className="grid gap-6 lg:grid-cols-2">
				<ListCard
					title="Pick up where you left off"
					viewAllHref={drafts.length > 0 ? '/admin/posts?status=draft' : undefined}
				>
					{drafts.length === 0 ? (
						<EmptyState
							icon={<PencilIcon />}
							title="No drafts in progress"
							description="Start a new post to see it here."
							action={
								<a href="/admin/posts/new" className={buttonClass('primary', 'sm')}>
									New post
								</a>
							}
						/>
					) : (
						<ul className="divide-y divide-border">
							{drafts.map((post) => (
								<CompactRow
									key={post.id}
									post={post}
									meta={`Updated ${formatDate(post.updatedAt)}`}
									publicationName={publicationName}
									actionLabel="Continue"
								/>
							))}
						</ul>
					)}
				</ListCard>

				<ListCard
					title="Scheduled"
					viewAllHref={scheduled.length > 0 ? '/admin/posts?status=scheduled' : undefined}
				>
					{scheduled.length === 0 ? (
						<EmptyState
							icon={<ClockIcon />}
							title="Nothing scheduled"
							description="Posts with a future publish date appear here."
						/>
					) : (
						<ul className="divide-y divide-border">
							{scheduled.map((post) => (
								<CompactRow
									key={post.id}
									post={post}
									meta={`Scheduled for ${formatDate(post.publishedAt)}`}
									publicationName={publicationName}
									actionLabel="Edit"
								/>
							))}
						</ul>
					)}
				</ListCard>
			</div>

			<ListCard title="Recent posts" viewAllHref="/admin/posts">
				{recent.length === 0 ? (
					<EmptyState
						icon={<FileIcon />}
						title="No posts yet"
						description="Recent activity appears here once you start writing."
						action={
							<a href="/admin/posts/new" className={buttonClass('primary', 'sm')}>
								New post
							</a>
						}
					/>
				) : (
					<ul className="divide-y divide-border">
						{recent.map((post) => (
							<li
								key={post.id}
								className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 hover:bg-surface-elevated"
							>
								<a href={`/admin/posts/${post.id}/view`} className="flex min-w-0 flex-1 items-center gap-3">
									{post.featuredImage ? (
										<LoadingImage
											src={post.featuredImage.url}
											alt=""
											wrapperClassName="size-12 shrink-0 rounded-md border border-border"
										/>
									) : (
										<span className="grid size-12 shrink-0 place-content-center rounded-md border border-border bg-muted text-muted-foreground">
											<ImagePlaceholderIcon />
										</span>
									)}
									<div className="min-w-0">
										<p className="truncate font-medium text-foreground">{post.title}</p>
										<p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
											<span className={badgeClass('soft')}>{publicationName(post.publication)}</span>
											{post.updatedAt && <span>Updated on {formatDate(post.updatedAt)}</span>}
										</p>
									</div>
								</a>
								<div className="flex shrink-0 items-center gap-2">
									<span className={statusBadgeClass(post.status)}>
										{STATUS_LABELS[post.status] ?? post.status}
									</span>
									<a
										href={`/admin/posts/${post.id}/view`}
										aria-label={`View ${post.title}`}
										title="View"
										className={buttonClass('accentOutline', 'icon')}
									>
										<EyeIcon />
									</a>
									<a
										href={`/admin/posts/${post.id}/edit`}
										aria-label={`Edit ${post.title}`}
										title="Edit"
										className={buttonClass('accentOutline', 'icon')}
									>
										<PencilIcon />
									</a>
								</div>
							</li>
						))}
					</ul>
				)}
			</ListCard>
		</div>
	);
}

function CountTile({ label, value, caption, href }: { label: string; value: number; caption: string; href: string }) {
	return (
		<a
			href={href}
			className="rounded-md border border-border bg-secondary p-5 shadow-sm transition-colors hover:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
		>
			<p className="text-sm font-medium text-on-secondary">{label}</p>
			<p className="mt-1 text-3xl font-semibold text-foreground">{value}</p>
			<p className="mt-1 text-xs text-muted-foreground">{caption}</p>
		</a>
	);
}

function ListCard({ title, viewAllHref, children }: { title: string; viewAllHref?: string; children: React.ReactNode }) {
	return (
		<section className={cardClass()}>
			<div className="flex items-center justify-between border-b border-border px-5 py-4">
				<h2 className="text-base font-semibold text-foreground">{title}</h2>
				{viewAllHref && (
					<a href={viewAllHref} className="text-xs font-medium text-accent-foreground underline-offset-2 hover:underline">
						View all
					</a>
				)}
			</div>
			{children}
		</section>
	);
}

function CompactRow({
	post,
	meta,
	publicationName,
	actionLabel,
}: {
	post: ListPost;
	meta: string;
	publicationName: (slug: string) => string;
	actionLabel: string;
}) {
	return (
		<li className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-elevated">
			<a href={`/admin/posts/${post.id}/edit`} className="min-w-0 flex-1">
				<p className="truncate font-medium text-foreground">{post.title}</p>
				<p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
					<span className={badgeClass('soft')}>{publicationName(post.publication)}</span>
					<span>{meta}</span>
				</p>
			</a>
			<a href={`/admin/posts/${post.id}/edit`} className={`${buttonClass('accentOutline', 'sm')} shrink-0`}>
				<PencilIcon />
				{actionLabel}
			</a>
		</li>
	);
}

function ClockIcon() {
	return (
		<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5">
			<circle cx="12" cy="12" r="10" />
			<polyline points="12 6 12 12 16 14" />
		</svg>
	);
}

function FileIcon() {
	return (
		<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5">
			<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
			<path d="M14 2v4a2 2 0 0 0 2 2h4" />
		</svg>
	);
}

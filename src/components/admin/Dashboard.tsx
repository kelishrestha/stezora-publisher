import { useEffect, useState } from 'react';
import EmptyState from './EmptyState';
import LoadingImage from './LoadingImage';
import { filterSelectClass } from './filters';
import { EyeIcon, ImagePlaceholderIcon, PencilIcon } from './icons';
import {
	badgeClass,
	buttonClass,
	cardClass,
	statCardClass,
	statCardLabelClass,
	statCardValueClass,
	statusBadgeClass,
} from '../ui/shared/classes';

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
	totalMedia: number;
}

const STATUS_LABELS: Record<string, string> = {
	draft: 'Draft',
	scheduled: 'Scheduled',
	published: 'Published',
	archived: 'Archived',
};

type PostStatus = 'draft' | 'scheduled' | 'published' | 'archived';
const STATUS_ORDER: PostStatus[] = ['draft', 'scheduled', 'published', 'archived'];

// Books are static publications (no CMS posts), listed when Type is Book.
const BOOKS = ['The Warrior Must Rise', 'The Peach Fall'];
const EMPTY_COUNTS = { draft: 0, scheduled: 0, published: 0, archived: 0 };

function formatDate(value: string | null): string {
	if (!value) return '—';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function Dashboard() {
	const [stats, setStats] = useState<Stats | null>(null);
	const [recentPosts, setRecentPosts] = useState<ListPost[] | null>(null);
	const [publicationNames, setPublicationNames] = useState<Record<string, string>>({});
	const [error, setError] = useState<string | null>(null);
	const [statusType, setStatusType] = useState<'publication' | 'book'>('publication');
	const [statusItem, setStatusItem] = useState('');

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
			// Recent posts come straight from the posts API (it returns the
			// most recently updated posts first), so the rows carry the same
			// data as the posts table: image, update date, publication, status.
			const [statsData, postsData, meta] = await Promise.all([
				request<Stats>('/api/admin/stats'),
				request<{ posts: ListPost[] }>('/api/admin/posts?limit=10&sort=published'),
				request<{ publications: PublicationOption[] }>('/api/admin/posts/meta').catch(() => null),
			]);
			if (cancelled || !statsData || !postsData) return;
			setStats(statsData);
			setRecentPosts(postsData.posts);
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

	if (!stats || !recentPosts) {
		return (
			<div className="grid gap-4 md:grid-cols-2">
				{[0, 1, 2].map((i) => (
					<div key={i} className="h-32 animate-pulse rounded-md border border-border bg-surface shadow-sm" />
				))}
			</div>
		);
	}

	const totalPosts = stats.publications.reduce((sum, p) => sum + p.draft + p.scheduled + p.published + p.archived, 0);

	// The two selects are connected: Type decides what the second one lists.
	const statusOptions =
		statusType === 'publication'
			? stats.publications.map((publication) => ({ value: publication.slug, label: publication.name }))
			: BOOKS.map((book) => ({ value: book, label: book }));
	const selectedOption = statusOptions.find((option) => option.value === statusItem) ?? statusOptions[0];
	const selectedCounts =
		statusType === 'publication'
			? (stats.publications.find((publication) => publication.slug === selectedOption?.value) ?? EMPTY_COUNTS)
			: EMPTY_COUNTS;

	return (
		<div className="space-y-6">
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<div className={statCardClass}>
					<p className={statCardLabelClass}>Publications</p>
					<p className={statCardValueClass}>{stats.publications.length}</p>
				</div>
				<div className={statCardClass}>
					<p className={statCardLabelClass}>Total posts</p>
					<p className={statCardValueClass}>{totalPosts}</p>
				</div>
				<div className={statCardClass}>
					<p className={statCardLabelClass}>Published</p>
					<p className={statCardValueClass}>
						{stats.publications.reduce((sum, p) => sum + p.published, 0)}
					</p>
				</div>
				<div className={statCardClass}>
					<p className={statCardLabelClass}>Media files</p>
					<p className={statCardValueClass}>{stats.totalMedia}</p>
				</div>
			</div>

			<div className={cardClass()}>
				<div className="flex flex-wrap items-end justify-between gap-4 border-b border-border px-5 py-4">
					<h2 className="text-base font-semibold text-foreground">Publication status</h2>
					<div className="flex flex-wrap items-end gap-4">
						<label htmlFor="status-type" className="block w-40">
							<span className="text-sm font-medium text-foreground">Type</span>
							<select
								id="status-type"
								value={statusType}
								onChange={(event) => {
									setStatusType(event.target.value as 'publication' | 'book');
									setStatusItem('');
								}}
								className={filterSelectClass}
							>
								<option value="publication">Publication</option>
								<option value="book">Book</option>
							</select>
						</label>
						<label htmlFor="status-item" className="block w-64">
							<span className="text-sm font-medium text-foreground">
								{statusType === 'publication' ? 'Publication' : 'Book'}
							</span>
							<select
								id="status-item"
								value={selectedOption?.value ?? ''}
								onChange={(event) => setStatusItem(event.target.value)}
								className={filterSelectClass}
							>
								{statusOptions.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
						</label>
					</div>
				</div>
				<div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
					{STATUS_ORDER.map((status) => (
						<div key={status} className={statCardClass}>
							<p className={statCardLabelClass}>{STATUS_LABELS[status]}</p>
							<p className={statCardValueClass}>{selectedCounts[status]}</p>
						</div>
					))}
				</div>
				{statusType === 'book' && (
					<p className="px-5 pb-4 text-xs text-muted-foreground">
						Books are static publications without CMS posts, so their counts stay at zero.
					</p>
				)}
			</div>

			<div className={cardClass()}>
				<h2 className="border-b border-border px-5 py-4 text-base font-semibold text-foreground">
					Recent posts
				</h2>
				{recentPosts.length === 0 ? (
					<EmptyState icon={<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /></svg>} title="No posts yet" description="Recent posts appear here once you start writing." />
				) : (
					<ul className="divide-y divide-border">
						{recentPosts.map((post) => (
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
											<span className={badgeClass('soft')}>
												{publicationNames[post.publication] ?? post.publication}
											</span>
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
			</div>
		</div>
	);
}
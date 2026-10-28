import { useEffect, useState } from 'react';

interface PublicationStats {
	slug: string;
	name: string;
	draft: number;
	scheduled: number;
	published: number;
	archived: number;
}

interface RecentPost {
	id: string;
	title: string;
	slug: string;
	publication: string;
	status: string;
	publishedAt: string | null;
}

interface Stats {
	publications: PublicationStats[];
	totalMedia: number;
	recentPosts: RecentPost[];
}

const STATUS_LABELS: Record<string, string> = {
	draft: 'Draft',
	scheduled: 'Scheduled',
	published: 'Published',
	archived: 'Archived',
};

const STATUS_ORDER: Array<keyof PublicationStats> = ['draft', 'scheduled', 'published', 'archived'];

function statusClass(status: string): string {
	switch (status) {
		case 'published':
			return 'bg-accent-soft text-accent-foreground';
		case 'scheduled':
			return 'bg-muted text-muted-foreground';
		case 'archived':
			return 'bg-muted text-muted-foreground';
		default:
			return 'bg-muted text-foreground';
	}
}

function formatDate(value: string | null): string {
	if (!value) return '—';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function Dashboard() {
	const [stats, setStats] = useState<Stats | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		fetch('/api/admin/stats', { credentials: 'same-origin' })
			.then(async (response) => {
				if (response.status === 401) {
					window.location.href = '/admin/login';
					return null;
				}
				if (!response.ok) {
					throw new Error(`Failed to load stats (HTTP ${response.status}).`);
				}
				const body = (await response.json()) as { data: Stats };
				return body.data;
			})
			.then((data) => {
				if (!cancelled && data) setStats(data);
			})
			.catch((reason: unknown) => {
				if (!cancelled) setError(reason instanceof Error ? reason.message : 'Failed to load stats.');
			});

		return () => {
			cancelled = true;
		};
	}, []);

	if (error) {
		return <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-foreground">{error}</p>;
	}

	if (!stats) {
		return (
			<div className="grid gap-4 md:grid-cols-2">
				{[0, 1, 2].map((i) => (
					<div key={i} className="h-32 animate-pulse rounded-md border border-border bg-surface shadow-sm" />
				))}
			</div>
		);
	}

	const totalPosts = stats.publications.reduce((sum, p) => sum + p.draft + p.scheduled + p.published + p.archived, 0);

	return (
		<div className="space-y-6">
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<div className="rounded-md border border-border bg-accent-soft shadow-sm p-5">
					<p className="text-sm font-medium text-accent-foreground">Publications</p>
					<p className="mt-1 text-3xl font-semibold text-foreground">{stats.publications.length}</p>
				</div>
				<div className="rounded-md border border-border bg-accent-soft shadow-sm p-5">
					<p className="text-sm font-medium text-accent-foreground">Total posts</p>
					<p className="mt-1 text-3xl font-semibold text-foreground">{totalPosts}</p>
				</div>
				<div className="rounded-md border border-border bg-accent-soft shadow-sm p-5">
					<p className="text-sm font-medium text-accent-foreground">Published</p>
					<p className="mt-1 text-3xl font-semibold text-foreground">
						{stats.publications.reduce((sum, p) => sum + p.published, 0)}
					</p>
				</div>
				<div className="rounded-md border border-border bg-accent-soft shadow-sm p-5">
					<p className="text-sm font-medium text-accent-foreground">Media files</p>
					<p className="mt-1 text-3xl font-semibold text-foreground">{stats.totalMedia}</p>
				</div>
			</div>

			<div className="rounded-md border border-border bg-surface shadow-sm">
				<h2 className="border-b border-border px-5 py-4 text-base font-semibold text-foreground">
					Posts per publication
				</h2>
				<div className="overflow-x-auto">
					<table className="min-w-full divide-y-2 divide-border text-left text-sm">
						<thead className="text-xs uppercase tracking-wide text-muted-foreground">
							<tr>
								<th className="px-3 py-2 whitespace-nowrap font-medium">Publication</th>
								{STATUS_ORDER.map((status) => (
									<th key={status} className="px-3 py-2 whitespace-nowrap font-medium">
										{STATUS_LABELS[status]}
									</th>
								))}
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{stats.publications.map((publication) => (
								<tr key={publication.slug} className="text-foreground">
									<td className="px-3 py-2 whitespace-nowrap font-medium">{publication.name}</td>
									{STATUS_ORDER.map((status) => (
										<td key={status} className="px-3 py-2 whitespace-nowrap tabular-nums">
											{publication[status]}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>

			<div className="rounded-md border border-border bg-surface shadow-sm">
				<h2 className="border-b border-border px-5 py-4 text-base font-semibold text-foreground">
					Recent posts
				</h2>
				{stats.recentPosts.length === 0 ? (
					<p className="px-5 py-6 text-sm text-muted-foreground">No posts yet.</p>
				) : (
					<ul className="divide-y divide-border">
						{stats.recentPosts.map((post) => (
							<li key={post.id} className="flex items-center justify-between gap-4 px-3 py-2 whitespace-nowrap">
								<div className="min-w-0">
									<p className="truncate font-medium text-foreground">{post.title}</p>
									<p className="text-xs text-muted-foreground">
										{post.publication} · {formatDate(post.publishedAt)}
									</p>
								</div>
								<div className="flex shrink-0 items-center gap-2">
									<span
										className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass(post.status)}`}
									>
										{STATUS_LABELS[post.status] ?? post.status}
									</span>
									<a
										href={`/admin/posts/${post.id}/view`}
										className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground hover:bg-surface-elevated"
									>
										View
									</a>
									<a
										href={`/admin/posts/${post.id}/edit`}
										className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground hover:bg-surface-elevated"
									>
										Edit
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
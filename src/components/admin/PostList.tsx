import { useEffect, useState } from 'react';

interface ListPost {
	id: string;
	title: string;
	slug: string;
	publication: string;
	status: string;
	publishedAt: string | null;
	updatedAt: string | null;
}

const STATUS_LABELS: Record<string, string> = {
	draft: 'Draft',
	scheduled: 'Scheduled',
	published: 'Published',
	archived: 'Archived',
};

const STATUS_ORDER = ['all', 'draft', 'scheduled', 'published', 'archived'];

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

export default function PostList() {
	const [posts, setPosts] = useState<ListPost[] | null>(null);
	const [filter, setFilter] = useState('all');
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		fetch('/api/admin/posts', { credentials: 'same-origin' })
			.then(async (response) => {
				if (response.status === 401) {
					window.location.href = '/admin/login';
					return null;
				}
				if (!response.ok) {
					throw new Error(`Failed to load posts (HTTP ${response.status}).`);
				}
				const body = (await response.json()) as { data: { posts: ListPost[] } };
				return body.data.posts;
			})
			.then((data) => {
				if (!cancelled && data) setPosts(data);
			})
			.catch((reason: unknown) => {
				if (!cancelled) setError(reason instanceof Error ? reason.message : 'Failed to load posts.');
			});

		return () => {
			cancelled = true;
		};
	}, []);

	if (error) {
		return <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-foreground">{error}</p>;
	}

	if (!posts) {
		return <p className="text-sm text-muted-foreground">Loading…</p>;
	}

	const visible = filter === 'all' ? posts : posts.filter((post) => post.status === filter);

	return (
		<div className="rounded-md border border-border bg-surface shadow-sm">
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
				<h2 className="text-base font-semibold text-foreground">Posts</h2>
				<a
					href="/admin/posts/new"
					className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent hover:opacity-90"
				>
					New post
				</a>
			</div>

			<div className="flex flex-wrap gap-1 border-b border-border px-3 py-2 whitespace-nowrap text-sm">
				{STATUS_ORDER.map((option) => (
					<button
						key={option}
						type="button"
						onClick={() => setFilter(option)}
						className={`rounded-full px-3 py-1 capitalize ${
							filter === option
								? 'bg-accent-soft text-accent-foreground'
								: 'text-muted-foreground hover:bg-surface-elevated hover:text-foreground'
						}`}
					>
						{option}
					</button>
				))}
			</div>

			{visible.length === 0 ? (
				<p className="px-5 py-8 text-sm text-muted-foreground">No posts{filter === 'all' ? '' : ` (${filter})`} yet.</p>
			) : (
				<ul className="divide-y divide-border">
					{visible.map((post) => (
						<li key={post.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2 hover:bg-surface-elevated">
							<a href={`/admin/posts/${post.id}/view`} className="min-w-0 flex-1">
								<p className="truncate font-medium text-foreground">{post.title}</p>
								<p className="text-xs text-muted-foreground">
									{post.publication} · /{post.slug} · updated {formatDate(post.updatedAt)}
								</p>
							</a>
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
	);
}

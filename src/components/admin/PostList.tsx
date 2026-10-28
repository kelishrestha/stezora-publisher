import { useEffect, useState, type ReactNode } from 'react';

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

const STATUS_LABELS: Record<string, string> = {
	draft: 'Draft',
	scheduled: 'Scheduled',
	published: 'Published',
	archived: 'Archived',
};

const TABS = ['all', 'draft', 'scheduled', 'published', 'archived'];

const TAB_LABELS: Record<string, string> = { all: 'All', ...STATUS_LABELS };

function statusClass(status: string): string {
	switch (status) {
		case 'published':
			// Published stands out in emerald rather than the theme accent.
			return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300';
		case 'scheduled':
		case 'archived':
			return 'bg-muted text-muted-foreground';
		default:
			return 'bg-muted text-foreground';
	}
}

function formatDate(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

interface IconProps {
	className?: string;
}

/* Lucide icon paths, inlined because React islands cannot use astro-icon. */
function TabIcon({ name, className = 'size-4' }: IconProps & { name: string }) {
	const paths: Record<string, ReactNode> = {
		all: (
			<>
				<line x1="8" x2="21" y1="6" y2="6" />
				<line x1="8" x2="21" y1="12" y2="12" />
				<line x1="8" x2="21" y1="18" y2="18" />
				<line x1="3" x2="3.01" y1="6" y2="6" />
				<line x1="3" x2="3.01" y1="12" y2="12" />
				<line x1="3" x2="3.01" y1="18" y2="18" />
			</>
		),
		draft: <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />,
		scheduled: (
			<>
				<circle cx="12" cy="12" r="10" />
				<polyline points="12 6 12 12 16 14" />
			</>
		),
		published: (
			<>
				<circle cx="12" cy="12" r="10" />
				<path d="m9 12 2 2 4-4" />
			</>
		),
		archived: (
			<>
				<rect width="20" height="5" x="2" y="3" rx="1" />
				<path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
				<path d="M10 12h4" />
			</>
		),
	};
	return (
		<svg
			aria-hidden="true"
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			{paths[name]}
		</svg>
	);
}

function EyeIcon({ className = 'size-4' }: IconProps) {
	return (
		<svg
			aria-hidden="true"
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
			<circle cx="12" cy="12" r="3" />
		</svg>
	);
}

function ImagePlaceholderIcon({ className = 'size-5' }: IconProps) {
	return (
		<svg
			aria-hidden="true"
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			<rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
			<circle cx="9" cy="9" r="2" />
			<path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
		</svg>
	);
}

function PencilIcon({ className = 'size-4' }: IconProps) {
	return (
		<svg
			aria-hidden="true"
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
		</svg>
	);
}

export default function PostList() {
	const [posts, setPosts] = useState<ListPost[] | null>(null);
	const [publicationNames, setPublicationNames] = useState<Record<string, string>>({});
	const [filter, setFilter] = useState('all');
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			const posts = await fetch('/api/admin/posts', { credentials: 'same-origin' }).then(async (response) => {
				if (response.status === 401) {
					window.location.href = '/admin/login';
					return null;
				}
				if (!response.ok) {
					throw new Error(`Failed to load posts (HTTP ${response.status}).`);
				}
				const body = (await response.json()) as { data: { posts: ListPost[] } };
				return body.data.posts;
			});
			if (cancelled || !posts) return;
			setPosts(posts);

			// Display names for publication badges; slugs are the row identity.
			try {
				const response = await fetch('/api/admin/posts/meta', { credentials: 'same-origin' });
				if (response.ok) {
					const body = (await response.json()) as { data: { publications: PublicationOption[] } };
					if (!cancelled) {
						setPublicationNames(
							Object.fromEntries(body.data.publications.flatMap((p) => [[p.slug, p.name], [p.id, p.name]]))
						);
					}
				}
			} catch {
				// Badges fall back to the slug; the list still works.
			}
		}

		load().catch((reason: unknown) => {
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

	const counts: Record<string, number> = { all: posts.length };
	for (const tab of TABS.slice(1)) {
		counts[tab] = posts.filter((post) => post.status === tab).length;
	}

	const visible = filter === 'all' ? posts : posts.filter((post) => post.status === filter);

	return (
		<div className="space-y-4">
			{/* HyperUI tabs (border-bottom style) with icons and count badges. */}
			<div className="border-b border-border">
				<nav aria-label="Post status" className="-mb-px flex flex-wrap gap-4 overflow-x-auto sm:gap-6">
					{TABS.map((tab) => {
						const active = filter === tab;
						return (
							<button
								key={tab}
								type="button"
								onClick={() => setFilter(tab)}
								className={`flex shrink-0 items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
									active
										? 'border-accent text-accent-foreground'
										: 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
								}`}
								aria-current={active ? 'page' : undefined}
							>
								<TabIcon name={tab} />
								{TAB_LABELS[tab]}
								<span
									className={`rounded-full px-2 py-0.5 text-xs ${
										active ? 'bg-accent-soft text-accent-foreground' : 'bg-muted text-muted-foreground'
									}`}
								>
									{counts[tab]}
								</span>
							</button>
						);
					})}
				</nav>
			</div>

			<div className="rounded-md border border-border bg-surface shadow-sm">
				{visible.length === 0 ? (
					<p className="px-5 py-8 text-sm text-muted-foreground">No posts{filter === 'all' ? '' : ` (${filter})`} yet.</p>
				) : (
					<ul className="divide-y divide-border">
						{visible.map((post) => (
							<li
								key={post.id}
								className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 hover:bg-surface-elevated"
							>
								<a href={`/admin/posts/${post.id}/view`} className="flex min-w-0 flex-1 items-center gap-3">
									{post.featuredImage ? (
										<img
											src={post.featuredImage.url}
											alt=""
											loading="lazy"
											className="size-12 shrink-0 rounded-md border border-border object-cover"
										/>
									) : (
										<span className="grid size-12 shrink-0 place-content-center rounded-md border border-border bg-muted text-muted-foreground">
											<ImagePlaceholderIcon />
										</span>
									)}
									<div className="min-w-0">
										<p className="truncate font-medium text-foreground">{post.title}</p>
										<p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
											<span className="rounded-full bg-accent-soft px-2.5 py-0.5 whitespace-nowrap text-accent-foreground">
												{publicationNames[post.publication] ?? post.publication}
											</span>
											{post.updatedAt && <span>Updated on {formatDate(post.updatedAt)}</span>}
										</p>
									</div>
								</a>
								<div className="flex shrink-0 items-center gap-2">
									<span
										className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass(post.status)}`}
									>
										{STATUS_LABELS[post.status] ?? post.status}
									</span>
									<a
										href={`/admin/posts/${post.id}/view`}
										aria-label={`View ${post.title}`}
										title="View"
										className="rounded-md bg-accent-soft p-2 text-accent-foreground transition-colors hover:bg-accent hover:text-on-accent focus:outline-none focus:ring-2 focus:ring-accent"
									>
										<EyeIcon />
									</a>
									<a
										href={`/admin/posts/${post.id}/edit`}
										aria-label={`Edit ${post.title}`}
										title="Edit"
										className="rounded-md bg-accent-soft p-2 text-accent-foreground transition-colors hover:bg-accent hover:text-on-accent focus:outline-none focus:ring-2 focus:ring-accent"
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

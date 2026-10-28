import { useEffect, useState } from 'react';
import AdminBreadcrumbs from './AdminBreadcrumbs';
import LoadingImage from './LoadingImage';

interface PostRecord {
	id: string;
	publicationId: string;
	publication: string;
	title: string;
	slug: string;
	excerpt: string;
	content: string;
	contentMarkdown: string;
	tags: string[];
	status: string;
	publishedAt: string | null;
	updatedAt: string | null;
	seoTitle: string | null;
	seoDescription: string | null;
	canonicalUrl: string | null;
	bloggerBlogId: string | null;
	bloggerPostId: string | null;
	featuredImage: { id: string; url: string; filename: string; mimeType: string } | null;
	createdAt: string;
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

function formatDate(value: string | null): string {
	if (!value) return 'Never';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function postIdFromPath(): string | undefined {
	const match = window.location.pathname.match(/^\/admin\/posts\/([^/]+)\/view$/);
	return match?.[1];
}

function PencilIcon({ className = 'size-4' }: { className?: string }) {
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

export default function PostView() {
	const [post, setPost] = useState<PostRecord | null>(null);
	const [publicationNames, setPublicationNames] = useState<Record<string, string>>({});
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const id = postIdFromPath();
		if (!id) {
			setError('No post id in the URL.');
			return;
		}
		let cancelled = false;

		fetch(`/api/admin/posts/${id}`, { credentials: 'same-origin' })
			.then(async (response) => {
				if (response.status === 401) {
					window.location.href = '/admin/login';
					return null;
				}
				if (!response.ok) {
					throw new Error(`Failed to load post (HTTP ${response.status}).`);
				}
				const body = (await response.json()) as { data: { post: PostRecord } };
				return body.data.post;
			})
			.then((data) => {
				if (!cancelled && data) setPost(data);
			})
			.catch((reason: unknown) => {
				if (!cancelled) setError(reason instanceof Error ? reason.message : 'Failed to load post.');
			});

		// Display names for the publication (the post carries its slug).
		fetch('/api/admin/posts/meta', { credentials: 'same-origin' })
			.then(async (response) => (response.ok ? ((await response.json()) as { data: { publications: PublicationOption[] } }) : null))
			.then((body) => {
				if (!cancelled && body) {
					setPublicationNames(
						Object.fromEntries(body.data.publications.flatMap((p) => [[p.slug, p.name], [p.id, p.name]]))
					);
				}
			})
			.catch(() => {
				// The name map is cosmetic; the slug remains a usable fallback.
			});

		return () => {
			cancelled = true;
		};
	}, []);

	if (error) {
		return <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-foreground">{error}</p>;
	}

	if (!post) {
		return <p className="text-sm text-muted-foreground">Loading…</p>;
	}

	const publicationName = publicationNames[post.publication] ?? publicationNames[post.publicationId] ?? post.publication;

	return (
		<div className="space-y-6">
			<AdminBreadcrumbs items={[{ name: 'All posts', href: '/admin/posts' }, { name: post.title }]} />
			<div className="rounded-md border border-border bg-surface shadow-sm p-6">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h2 className="font-serif text-2xl font-semibold text-foreground">{post.title}</h2>
					<div className="flex items-center gap-2">
						<span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass(post.status)}`}>
							{STATUS_LABELS[post.status] ?? post.status}
						</span>
						<a
							href={`/admin/posts/${post.id}/edit`}
							className="inline-flex items-center gap-1.5 rounded-md border border-accent bg-accent-soft px-3 py-1.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent hover:text-on-accent focus:outline-none focus:ring-2 focus:ring-accent"
						>
							<PencilIcon />
							Edit post
						</a>
					</div>
				</div>
				<p className="mt-1 text-sm text-muted-foreground">{publicationName}</p>
				{post.excerpt && <p className="mt-3 text-sm text-muted-foreground">{post.excerpt}</p>}
			</div>

			<div className="rounded-md border border-border bg-surface shadow-sm">
				<h3 className="border-b border-border px-5 py-4 text-sm font-semibold uppercase tracking-wide text-foreground">Details</h3>
				<ul className="divide-y divide-border text-sm">
					<li className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2">
						<span className="w-40 shrink-0 text-muted-foreground">Publication</span>
						<span className="min-w-0 break-words text-foreground">{publicationName}</span>
					</li>
					<li className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2">
						<span className="w-40 shrink-0 text-muted-foreground">Slug</span>
						<span className="min-w-0 break-words text-foreground">/{post.slug}</span>
					</li>
					<li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
						<span className="w-40 shrink-0 text-muted-foreground">Tags</span>
						{post.tags.length > 0 ? (
							<span className="flex min-w-0 flex-wrap gap-1.5">
								{post.tags.map((tag) => (
									<span
										key={tag}
										className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs whitespace-nowrap text-accent-foreground"
									>
										{tag}
									</span>
								))}
							</span>
						) : (
							<span className="text-muted-foreground">None</span>
						)}
					</li>
					<li className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2">
						<span className="w-40 shrink-0 text-muted-foreground">Published on</span>
						<span className="min-w-0 break-words text-foreground">{formatDate(post.publishedAt)}</span>
					</li>
					<li className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2">
						<span className="w-40 shrink-0 text-muted-foreground">Updated on</span>
						<span className="min-w-0 break-words text-foreground">{formatDate(post.updatedAt)}</span>
					</li>
					{post.seoTitle && (
						<li className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2">
							<span className="w-40 shrink-0 text-muted-foreground">SEO title</span>
							<span className="min-w-0 break-words text-foreground">{post.seoTitle}</span>
						</li>
					)}
					{post.seoDescription && (
						<li className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2">
							<span className="w-40 shrink-0 text-muted-foreground">SEO description</span>
							<span className="min-w-0 break-words text-foreground">{post.seoDescription}</span>
						</li>
					)}
					{post.canonicalUrl && (
						<li className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2">
							<span className="w-40 shrink-0 text-muted-foreground">Canonical URL</span>
							<a href={post.canonicalUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 break-all text-accent-foreground hover:underline">
								{post.canonicalUrl}
							</a>
						</li>
					)}
				</ul>
			</div>

			{/* Content on the left, the featured image on the right. */}
			<div className={post.featuredImage ? 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]' : ''}>
				<div className="rounded-md border border-border bg-surface shadow-sm">
					<h3 className="border-b border-border px-5 py-4 text-sm font-semibold uppercase tracking-wide text-foreground">Content</h3>
					<article
						className="prose prose-neutral max-w-none px-5 py-6 dark:prose-invert"
						dangerouslySetInnerHTML={{ __html: post.content }}
					/>
				</div>
				{post.featuredImage && (
					<div className="self-start rounded-md border border-border bg-surface shadow-sm lg:sticky lg:top-24">
						<h3 className="border-b border-border px-5 py-4 text-sm font-semibold uppercase tracking-wide text-foreground">
							Featured image
						</h3>
						<div className="p-4">
							<LoadingImage
								src={post.featuredImage.url}
								alt={post.featuredImage.filename}
								wrapperClassName="w-full rounded-md border border-border"
								imageClassName="w-full object-contain"
							/>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

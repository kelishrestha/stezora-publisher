import { useEffect, useState } from 'react';

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
	createdAt: string;
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
	return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function postIdFromPath(): string | undefined {
	const match = window.location.pathname.match(/^\/admin\/posts\/([^/]+)\/view$/);
	return match?.[1];
}

export default function PostView() {
	const [post, setPost] = useState<PostRecord | null>(null);
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

	return (
		<div className="space-y-6">
			<div className="rounded-xl border border-border bg-surface p-6">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h2 className="font-serif text-2xl font-semibold text-foreground">{post.title}</h2>
					<span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass(post.status)}`}>
						{STATUS_LABELS[post.status] ?? post.status}
					</span>
				</div>
				<p className="mt-1 text-sm text-muted-foreground">
					{post.publication} · /{post.slug}
				</p>
				{post.excerpt && <p className="mt-3 text-sm text-muted-foreground">{post.excerpt}</p>}
			</div>

			<div className="rounded-xl border border-border bg-surface">
				<h3 className="border-b border-border px-5 py-4 text-sm font-semibold uppercase tracking-wide text-foreground">Details</h3>
				<ul className="divide-y divide-border text-sm">
					<li className="flex gap-4 px-5 py-3">
						<span className="w-40 shrink-0 text-muted-foreground">Publication</span>
						<span className="text-foreground">{post.publication}</span>
					</li>
					<li className="flex gap-4 px-5 py-3">
						<span className="w-40 shrink-0 text-muted-foreground">Slug</span>
						<span className="text-foreground">/{post.slug}</span>
					</li>
					<li className="flex gap-4 px-5 py-3">
						<span className="w-40 shrink-0 text-muted-foreground">Tags</span>
						<span className="text-foreground">
							{post.tags.length > 0 ? post.tags.map((tag) => `#${tag}`).join(' ') : '—'}
						</span>
					</li>
					<li className="flex gap-4 px-5 py-3">
						<span className="w-40 shrink-0 text-muted-foreground">Published</span>
						<span className="text-foreground">{formatDate(post.publishedAt)}</span>
					</li>
					<li className="flex gap-4 px-5 py-3">
						<span className="w-40 shrink-0 text-muted-foreground">Updated</span>
						<span className="text-foreground">{formatDate(post.updatedAt)}</span>
					</li>
					{post.seoTitle && (
						<li className="flex gap-4 px-5 py-3">
							<span className="w-40 shrink-0 text-muted-foreground">SEO title</span>
							<span className="text-foreground">{post.seoTitle}</span>
						</li>
					)}
					{post.seoDescription && (
						<li className="flex gap-4 px-5 py-3">
							<span className="w-40 shrink-0 text-muted-foreground">SEO description</span>
							<span className="text-foreground">{post.seoDescription}</span>
						</li>
					)}
					{post.canonicalUrl && (
						<li className="flex gap-4 px-5 py-3">
							<span className="w-40 shrink-0 text-muted-foreground">Canonical URL</span>
							<a href={post.canonicalUrl} target="_blank" rel="noopener noreferrer" className="text-accent-foreground hover:underline">
								{post.canonicalUrl}
							</a>
						</li>
					)}
				</ul>
			</div>

			<div className="rounded-xl border border-border bg-surface">
				<h3 className="border-b border-border px-5 py-4 text-sm font-semibold uppercase tracking-wide text-foreground">Content</h3>
				<article
					className="prose prose-neutral max-w-none px-5 py-6 dark:prose-invert"
					dangerouslySetInnerHTML={{ __html: post.content }}
				/>
			</div>

			<div className="flex gap-3">
				<a
					href={`/admin/posts/${post.id}/edit`}
					className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90"
				>
					Edit post
				</a>
				<a
					href="/admin/posts"
					className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-elevated"
				>
					Back to posts
				</a>
			</div>
		</div>
	);
}
import { useEffect, useState } from 'react';
import AdminBreadcrumbs from './AdminBreadcrumbs';
import LoadingImage from './LoadingImage';
import { badgeClass, buttonClass, statusBadgeClass } from '../ui/shared/classes';
import { cardClass } from '../ui/shared/classes';

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
			<div className={`${cardClass()} p-6`}>
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h2 className="font-serif text-2xl font-semibold text-foreground">{post.title}</h2>
					<div className="flex items-center gap-2">
						<span className={statusBadgeClass(post.status)}>
							{STATUS_LABELS[post.status] ?? post.status}
						</span>
						<a
							href={`/admin/posts/${post.id}/edit`}
							className={buttonClass('primary', 'sm')}
						>
							<PencilIcon />
							Edit post
						</a>
					</div>
				</div>
				<p className="mt-1 text-sm text-muted-foreground">{publicationName}</p>
				{post.tags.length > 0 && (
					<p className="mt-2 flex flex-wrap gap-1.5">
						{post.tags.map((tag) => (
							<span
								key={tag}
								className={badgeClass('soft')}
							>
								{tag}
							</span>
						))}
					</p>
				)}
				<p className="mt-2 text-sm text-muted-foreground">
					Published on {formatDate(post.publishedAt)} · Updated on {formatDate(post.updatedAt)}
				</p>
				{post.canonicalUrl && (
					<p className="mt-2 text-sm">
						<a
							href={post.canonicalUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1.5 text-accent-foreground hover:underline"
						>
							See blogger post
							<svg
								aria-hidden="true"
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								className="size-3.5"
							>
								<path d="M15 3h6v6" />
								<path d="M10 14 21 3" />
								<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
							</svg>
						</a>
					</p>
				)}
				{post.excerpt && <p className="mt-3 text-sm text-muted-foreground">{post.excerpt}</p>}
			</div>

			{/* Content on the left, the featured image on the right: no card chrome. */}
			<div className={post.featuredImage ? 'grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]' : ''}>
				<article
					className="prose prose-neutral max-w-none dark:prose-invert"
					dangerouslySetInnerHTML={{ __html: post.content }}
				/>
				{post.featuredImage && (
					<div className="self-start lg:sticky lg:top-24">
						<LoadingImage
							src={post.featuredImage.url}
							alt={post.featuredImage.filename}
							wrapperClassName="w-full rounded-md border border-border"
							imageClassName="w-full object-contain"
						/>
					</div>
				)}
			</div>
		</div>
	);
}

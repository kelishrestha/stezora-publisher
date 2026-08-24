import { useCallback, useEffect, useMemo, useState } from 'react';

interface PublicationOption {
	id: string;
	name: string;
	slug: string;
	accent: string | null;
}

interface TagOption {
	id: string;
	publication_id: string;
	name: string;
	slug: string;
}

interface EditorMeta {
	publications: PublicationOption[];
	tags: TagOption[];
}

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

const STATUS_OPTIONS = ['draft', 'scheduled', 'published', 'archived'];

const inputClass =
	'mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none';

function slugify(value: string): string {
	const trimmed = value.toLowerCase().trim();
	if (!trimmed) return '';
	const slug = trimmed
		.replace(/[^a-z0-9\s_-]/g, '')
		.replace(/[\s_]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
	return slug;
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await fetch(url, { credentials: 'same-origin', ...init });
	if (response.status === 401) {
		window.location.href = '/admin/login';
		throw new Error('Authentication required.');
	}
	const body = (await response.json()) as { success: boolean; data?: T; error?: { message?: string } };
	if (!response.ok || !body.success) {
		throw new Error(body.error?.message ?? `Request failed (HTTP ${response.status}).`);
	}
	return body.data as T;
}

function toDateTimeLocal(value: string | null): string {
	if (!value) return '';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface PostEditorProps {
	postId?: string;
}

function postIdFromPath(): string | undefined {
	const match = window.location.pathname.match(/^\/admin\/posts\/([^/]+)\/edit$/);
	return match?.[1];
}

export default function PostEditor({ postId }: PostEditorProps) {
	// The edit page is a static shell: the Worker proxies /admin/posts/:id/edit
	// onto it, so the id must be read from the URL on the client. Accepting the
	// prop keeps new.astro and any direct prop-based usage working unchanged.
	const [editingPostId, setEditingPostId] = useState(postId);
	const [meta, setMeta] = useState<EditorMeta | null>(null);
	const [loading, setLoading] = useState(Boolean(postId));
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [preview, setPreview] = useState<{ html: string; title: string } | null>(null);

	const [title, setTitle] = useState('');
	const [publicationId, setPublicationId] = useState('');
	const [slug, setSlug] = useState('');
	const [excerpt, setExcerpt] = useState('');
	const [contentMarkdown, setContentMarkdown] = useState('');
	const [tags, setTags] = useState('');
	const [status, setStatus] = useState('draft');
	const [publishedAt, setPublishedAt] = useState('');
	const [seoTitle, setSeoTitle] = useState('');
	const [seoDescription, setSeoDescription] = useState('');

	const tagOptions = useMemo(
		() => meta?.tags.filter((tag) => tag.publication_id === publicationId) ?? [],
		[meta, publicationId]
	);

	const load = useCallback(async () => {
		try {
			const metaResult = await json<EditorMeta>('/api/admin/posts/meta');
			setMeta(metaResult);
			if (!publicationId && metaResult.publications.length > 0) {
				setPublicationId(metaResult.publications[0].id);
			}
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : 'Failed to load editor data.');
		}

		if (!editingPostId) {
			setLoading(false);
			return;
		}

		try {
			const { post } = await json<{ post: PostRecord }>(`/api/admin/posts/${editingPostId}`);
			setTitle(post.title);
			setPublicationId(post.publicationId);
			setSlug(post.slug);
			setExcerpt(post.excerpt);
			setContentMarkdown(post.contentMarkdown);
			setTags(post.tags.join(', '));
			setStatus(post.status);
			setPublishedAt(toDateTimeLocal(post.publishedAt));
			setSeoTitle(post.seoTitle ?? '');
			setSeoDescription(post.seoDescription ?? '');
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : 'Failed to load post.');
		} finally {
			setLoading(false);
		}
	}, [editingPostId, publicationId]);

	useEffect(() => {
		if (!postId) {
			setEditingPostId(postIdFromPath());
		}
	}, [postId]);

	useEffect(() => {
		void load();
	}, [load]);

	function deriveSlug() {
		setSlug(slugify(title));
	}

	async function save() {
		if (!publicationId) {
			setError('Select a publication.');
			return;
		}
		setSaving(true);
		setError(null);
		setNotice(null);
		try {
			const payload = {
				publicationId,
				title,
				slug,
				excerpt,
				contentMarkdown,
				tagNames: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
				status,
				publishedAt: publishedAt ? new Date(publishedAt).toISOString() : null,
				seoTitle: seoTitle || null,
				seoDescription: seoDescription || null,
			};
			const path = editingPostId ? `/api/admin/posts/${editingPostId}` : '/api/admin/posts';
			await json<{ post: PostRecord }>(path, {
				method: editingPostId ? 'PUT' : 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload),
			});
			setNotice('Post saved.');
			if (!editingPostId) {
				// Created — refresh to the new edit page (payload id unknown until
				// the response, so reload the list instead).
				window.location.href = '/admin/posts';
			}
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : 'Failed to save post.');
		} finally {
			setSaving(false);
		}
	}

	async function runPreview() {
		if (!editingPostId) {
			setError('Save the post before previewing.');
			return;
		}
		setError(null);
		try {
			const result = await json<{ html: string; title: string }>(`/api/admin/posts/${editingPostId}/preview`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ contentMarkdown }),
			});
			setPreview(result);
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : 'Failed to render preview.');
		}
	}

	if (loading) {
		return <p className="text-sm text-muted-foreground">Loading…</p>;
	}

	if (!meta) {
		return <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-foreground">{error ?? 'Loading editor…'}</p>;
	}

	return (
		<div className="space-y-6">
			{error && (
				<p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-foreground" role="alert">
					{error}
				</p>
			)}
			{notice && <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-foreground">{notice}</p>}

			<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
				<div className="space-y-4">
					<div>
						<label htmlFor="post-title" className="block text-sm font-medium text-foreground">
							Title
						</label>
						<input
							id="post-title"
							value={title}
							onChange={(event) => setTitle(event.target.value)}
							className={inputClass}
							placeholder="Post title"
						/>
					</div>

					<div className="grid gap-4 sm:grid-cols-2">
						<div>
							<label htmlFor="post-publication" className="block text-sm font-medium text-foreground">
								Publication
							</label>
							<select
								id="post-publication"
								value={publicationId}
								onChange={(event) => setPublicationId(event.target.value)}
								className={inputClass}
							>
								{meta.publications.map((publication) => (
									<option key={publication.id} value={publication.id}>
										{publication.name}
									</option>
								))}
							</select>
						</div>
						<div>
							<div className="flex items-end gap-2">
								<div className="flex-1">
									<label htmlFor="post-slug" className="block text-sm font-medium text-foreground">
										Slug
									</label>
									<input
										id="post-slug"
										value={slug}
										onChange={(event) => setSlug(event.target.value)}
										className={inputClass}
										placeholder="my-post-slug"
									/>
								</div>
								<button
									type="button"
									onClick={deriveSlug}
									className="mb-px rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
								>
									From title
								</button>
							</div>
						</div>
					</div>

					<div>
						<label htmlFor="post-content" className="block text-sm font-medium text-foreground">
							Content (Markdown)
						</label>
						<textarea
							id="post-content"
							value={contentMarkdown}
							onChange={(event) => setContentMarkdown(event.target.value)}
							rows={18}
							className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
							placeholder={'## A heading\n\nWrite your post in Markdown…'}
						/>
					</div>

					<div>
						<label htmlFor="post-excerpt" className="block text-sm font-medium text-foreground">
							Excerpt
						</label>
						<textarea
							id="post-excerpt"
							value={excerpt}
							onChange={(event) => setExcerpt(event.target.value)}
							rows={2}
							className={inputClass}
							placeholder="Short summary shown on listing pages"
						/>
					</div>

					<div className="grid gap-4 sm:grid-cols-2">
						<div>
							<label htmlFor="post-tags" className="block text-sm font-medium text-foreground">
								Tags
							</label>
							<input
								id="post-tags"
								value={tags}
								onChange={(event) => setTags(event.target.value)}
								className={inputClass}
								placeholder="comma, separated, tags"
							/>
							{tagOptions.length > 0 && (
								<div className="mt-2 flex flex-wrap gap-1.5">
									{tagOptions.map((tag) => (
										<button
											key={tag.id}
											type="button"
											onClick={() => {
												const current = tags.split(',').map((t) => t.trim()).filter(Boolean);
												if (!current.includes(tag.name)) {
													setTags([...current, tag.name].join(', '));
												}
											}}
											className="rounded-full bg-accent-soft px-2.5 py-1 text-xs text-accent-foreground transition-colors hover:opacity-80"
										>
											#{tag.name}
										</button>
									))}
								</div>
							)}
						</div>
						<div>
							<label className="block text-sm font-medium text-foreground">
								Media
							</label>
							<p className="mt-1 text-sm text-muted-foreground">
								Media is attached per post. Upload one image or document for this post in the{' '}
								<a href="/admin/media" className="text-accent-foreground hover:underline">
									Media manager
								</a>
								.
							</p>
						</div>
					</div>
				</div>

				<div className="space-y-4">
					<div>
						<label htmlFor="post-status" className="block text-sm font-medium text-foreground">
							Status
						</label>
						<select id="post-status" value={status} onChange={(event) => setStatus(event.target.value)} className={inputClass}>
							{STATUS_OPTIONS.map((option) => (
								<option key={option} value={option}>
									{option}
								</option>
							))}
						</select>
					</div>

					<div>
						<label htmlFor="post-published-at" className="block text-sm font-medium text-foreground">
							Publish date
						</label>
						<input
							id="post-published-at"
							type="datetime-local"
							value={publishedAt}
							onChange={(event) => setPublishedAt(event.target.value)}
							className={inputClass}
						/>
					</div>

					<div>
						<label htmlFor="post-seo-title" className="block text-sm font-medium text-foreground">
							SEO title
						</label>
						<input
							id="post-seo-title"
							value={seoTitle}
							onChange={(event) => setSeoTitle(event.target.value)}
							className={inputClass}
							placeholder="Optional meta title"
						/>
					</div>

					<div>
						<label htmlFor="post-seo-description" className="block text-sm font-medium text-foreground">
							SEO description
						</label>
						<textarea
							id="post-seo-description"
							value={seoDescription}
							onChange={(event) => setSeoDescription(event.target.value)}
							rows={3}
							className={inputClass}
							placeholder="Optional meta description"
						/>
					</div>

					<div className="flex gap-3 pt-2">
						<button
							type="button"
							onClick={() => void save()}
							disabled={saving}
							className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{saving ? 'Saving…' : 'Save'}
						</button>
						<button
							type="button"
							onClick={() => void runPreview()}
							disabled={!editingPostId}
							className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-50"
						>
							Preview
						</button>
					</div>
				</div>
			</div>

			{preview && (
				<div className="rounded-xl border border-border bg-surface">
					<h2 className="border-b border-border px-5 py-4 text-base font-semibold text-foreground">Preview</h2>
					<article
						className="prose prose-neutral max-w-none px-5 py-6 dark:prose-invert"
						// Preview is rendered server-side through the same sanitized
						// pipeline as production (DEVELOPER.md §63, §83).
						dangerouslySetInnerHTML={{ __html: preview.html }}
					/>
				</div>
			)}
		</div>
	);
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminBreadcrumbs from './AdminBreadcrumbs';
import LoadingImage from './LoadingImage';
import Toast, { ToastStack } from './Toast';
import ConfirmDialog from './ConfirmDialog';

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

interface FeaturedImage {
	id: string;
	url: string;
	filename: string;
	mimeType: string;
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
	featuredImageId: string | null;
	featuredImage: FeaturedImage | null;
	createdAt: string;
}

interface MediaItem {
	id: string;
	postId: string;
	publicationId: string;
	filename: string;
	mimeType: string;
	size: number;
	url: string;
	// True for Blogger-sourced media that still lives on Blogger's CDN
	// (no R2 object yet).
	external?: boolean;
	createdAt: string;
}

const STATUS_OPTIONS = ['draft', 'scheduled', 'published', 'archived'];

const STATUS_LABELS: Record<string, string> = {
	draft: 'Draft',
	scheduled: 'Scheduled',
	published: 'Published',
	archived: 'Archived',
};

const inputClass =
	'mt-0.5 w-full rounded border-border bg-background text-foreground shadow-sm sm:text-sm placeholder:text-muted-foreground focus:border-accent focus:ring-accent';

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
	const [confirmingSave, setConfirmingSave] = useState(false);
	const [mediaToDelete, setMediaToDelete] = useState<MediaItem | null>(null);

	const [title, setTitle] = useState('');
	// Loaded post title, frozen for the breadcrumb while the user edits `title`.
	const [loadedTitle, setLoadedTitle] = useState('');
	const [publicationId, setPublicationId] = useState('');
	const [slug, setSlug] = useState('');
	const [excerpt, setExcerpt] = useState('');
	const [contentMarkdown, setContentMarkdown] = useState('');
	const [tags, setTags] = useState('');
	const [status, setStatus] = useState('draft');
	const [publishedAt, setPublishedAt] = useState('');
	const [seoTitle, setSeoTitle] = useState('');
	const [seoDescription, setSeoDescription] = useState('');
	// Media is post-owned: uploads plus Blogger-sourced images segregated out
	// of imported content. Any item can be marked as the featured image.
	const [postMedia, setPostMedia] = useState<MediaItem[]>([]);
	const [featuredImageId, setFeaturedImageId] = useState<string | null>(null);
	const [uploadingMedia, setUploadingMedia] = useState(false);
	// Full-size image preview shown in a modal overlay.
	const [previewImage, setPreviewImage] = useState<MediaItem | null>(null);

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
			setLoadedTitle(post.title);
			setPublicationId(post.publicationId);
			setSlug(post.slug);
			setExcerpt(post.excerpt);
			setContentMarkdown(post.contentMarkdown);
			setTags(post.tags.join(', '));
			setStatus(post.status);
			setPublishedAt(toDateTimeLocal(post.publishedAt));
			setSeoTitle(post.seoTitle ?? '');
			setSeoDescription(post.seoDescription ?? '');
			setFeaturedImageId(post.featuredImageId);
			if (!post.contentMarkdown && post.content) {
				setNotice(
					'This post has HTML content but no markdown source (run pnpm db:backfill to generate it). Saving now would replace the published content with the content box below.'
				);
			}
			await loadMedia(post.id);
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

	useEffect(() => {
		if (!previewImage) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setPreviewImage(null);
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [previewImage]);

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
				featuredImageId: editingPostId ? featuredImageId : null,
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

	/** Standalone preview document with a watermark; no site assets needed. */
	function previewDocument(previewTitle: string, html: string): string {
		return [
			'<!doctype html><html><head><meta charset="utf-8" />',
			'<meta name="robots" content="noindex" />',
			`<title>Preview: ${previewTitle}</title>`,
			'<style>',
			'body { margin: 0; font-family: Georgia, serif; color: #1c1c1c; background: #fcfcfc; }',
			'.banner { position: sticky; top: 0; z-index: 2; background: #4338ca; color: #fff;',
			'  font-family: system-ui, sans-serif; font-size: 13px; padding: 8px 16px; text-align: center; }',
			'.watermark { position: fixed; inset: 0; display: grid; place-content: center; pointer-events: none; z-index: 1; }',
			'.watermark span { font-family: system-ui, sans-serif; font-size: 16vw; font-weight: 800;',
			'  color: rgba(67, 56, 202, 0.07); transform: rotate(-28deg); letter-spacing: 0.1em; }',
			'main { position: relative; z-index: 0; max-width: 42rem; margin: 0 auto; padding: 3rem 1.5rem 6rem; line-height: 1.7; }',
			'main img { max-width: 100%; height: auto; }',
			'h1 { font-size: 2rem; }',
			'</style></head><body>',
			'<div class="banner">Preview. This is how the post will read; it is not published.</div>',
			'<div class="watermark" aria-hidden="true"><span>PREVIEW</span></div>',
			`<main><h1>${previewTitle}</h1>${html}</main>`,
			'</body></html>',
		].join('\n');
	}

	async function runPreview() {
		if (!editingPostId) {
			setError('Save the post before previewing.');
			return;
		}
		setError(null);
		// Open synchronously so the browser treats it as a user gesture.
		const tab = window.open('about:blank', '_blank');
		if (!tab) {
			setError('Allow pop-ups for this site to open the preview.');
			return;
		}
		tab.document.write('<title>Preview</title><p style="font-family: system-ui, sans-serif; padding: 2rem;">Rendering preview...</p>');
		try {
			const result = await json<{ html: string; title: string }>(`/api/admin/posts/${editingPostId}/preview`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ contentMarkdown }),
			});
			tab.document.open();
			tab.document.write(previewDocument(result.title || title, result.html));
			tab.document.close();
		} catch (reason) {
			tab.close();
			setError(reason instanceof Error ? reason.message : 'Failed to render preview.');
		}
	}

	/** Save goes through a confirmation box for both new and edited posts. */
	function requestSave() {
		if (!publicationId) {
			setError('Select a publication.');
			return;
		}
		if (!title.trim()) {
			setError('Enter a title.');
			return;
		}
		setError(null);
		setConfirmingSave(true);
	}

	/** Loads every media row belonging to this post (uploads and Blogger-sourced). */
	async function loadMedia(postIdOfPost: string) {
		try {
			const result = await json<{ media: MediaItem[] }>(
				`/api/admin/media?postId=${encodeURIComponent(postIdOfPost)}&limit=100`
			);
			setPostMedia(result.media);
		} catch {
			// Media display is best-effort; saving/editing still works.
			setPostMedia([]);
		}
	}

	async function handleUpload(file: File) {
		if (!editingPostId || !publicationId) return;
		setUploadingMedia(true);
		setError(null);
		try {
			const form = new FormData();
			form.append('file', file);
			form.append('postId', editingPostId);
			form.append('publicationId', publicationId);
			const result = await json<{ media: MediaItem }>('/api/admin/media', {
				method: 'POST',
				body: form,
			});
			setPostMedia((previous) => [result.media, ...previous]);
			// A fresh upload becomes the featured image candidate; it persists
			// with the next Save (PLAN P4.6.5).
			setFeaturedImageId(result.media.id);
			setNotice('Media uploaded. It becomes the featured image when you save.');
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : 'Upload failed.');
		} finally {
			setUploadingMedia(false);
		}
	}

	async function handleDeleteMedia(item: MediaItem) {
		setError(null);
		try {
			await json(`/api/admin/media/${item.id}`, { method: 'DELETE' });
			setPostMedia((previous) => previous.filter((media) => media.id !== item.id));
			if (featuredImageId === item.id) {
				setFeaturedImageId(null);
			}
			setNotice('Media deleted.');
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : 'Failed to delete media.');
		} finally {
			setMediaToDelete(null);
		}
	}

	function insertIntoContent(item: MediaItem) {
		const el = document.getElementById('post-content') as HTMLTextAreaElement | null;
		const start = el?.selectionStart ?? contentMarkdown.length;
		const end = el?.selectionEnd ?? contentMarkdown.length;
		const alt = item.filename.replace(/\.[a-z0-9]+$/i, '');
		const snippet = `\n![${alt}](${item.url})\n`;
		setContentMarkdown(`${contentMarkdown.slice(0, start)}${snippet}${contentMarkdown.slice(end)}`);
	}

	if (loading) {
		return <p className="text-sm text-muted-foreground">Loading…</p>;
	}

	if (!meta) {
		return <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-foreground">{error ?? 'Loading editor…'}</p>;
	}

	return (
		<div className="space-y-6">
			<AdminBreadcrumbs
				items={
					editingPostId
						? [
								{ name: 'All posts', href: '/admin/posts' },
								{ name: loadedTitle || 'Post', href: `/admin/posts/${editingPostId}/view` },
								{ name: 'Edit' },
							]
						: [{ name: 'All posts', href: '/admin/posts' }, { name: 'New post' }]
				}
			/>
			{previewImage && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm"
					role="dialog"
					aria-modal="true"
					onClick={() => setPreviewImage(null)}
				>
					<figure
						className="max-h-full max-w-3xl rounded-lg border border-border bg-surface p-3 shadow-lg"
						onClick={(event) => event.stopPropagation()}
					>
						<img
							src={previewImage.url}
							alt={previewImage.filename}
							className="max-h-[75vh] w-auto rounded-md"
						/>
						<figcaption className="mt-2 flex items-center justify-between gap-4 text-xs text-muted-foreground">
							<span>
								{previewImage.filename}
								{previewImage.external ? ' · Blogger-hosted' : ''}
							</span>
							<button
								type="button"
								onClick={() => setPreviewImage(null)}
								className="rounded-md border border-border bg-surface px-3 py-1.5 text-foreground hover:bg-surface-elevated"
							>
								Close
							</button>
						</figcaption>
					</figure>
				</div>
			)}
			<ToastStack>
				{error && <Toast tone="error" message={error} onDismiss={() => setError(null)} />}
				{notice && <Toast tone="success" message={notice} onDismiss={() => setNotice(null)} />}
			</ToastStack>

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
							Content
						</label>
						<textarea
							id="post-content"
							value={contentMarkdown}
							onChange={(event) => setContentMarkdown(event.target.value)}
							rows={18}
							className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-accent"
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
							<label className="block text-sm font-medium text-foreground">Media</label>
							{!editingPostId ? (
								<p className="mt-1 text-sm text-muted-foreground">
									Save the post first — media is attached to a saved post.
								</p>
							) : (
								<div className="mt-2 space-y-3">
									{postMedia.map((item) => (
										<div key={item.id} className="rounded-md border border-border p-2">
											<button
												type="button"
												onClick={() => setPreviewImage(item)}
												title="Click to preview"
												className="block w-full"
											>
												<LoadingImage
													src={item.url}
													alt={item.filename}
													wrapperClassName="h-32 w-full rounded"
												/>
											</button>
											<p className="mt-1 text-xs text-muted-foreground">
												{item.filename}
												{item.size > 0 ? ` · ${Math.round(item.size / 1024)} KB` : ''}
												{item.external ? ' · Blogger-hosted' : ''}
											</p>
											<div className="mt-1 flex flex-wrap gap-2">
												{featuredImageId === item.id ? (
													<button
														type="button"
														onClick={() => setFeaturedImageId(null)}
														className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-accent"
													>
														Remove as featured
													</button>
												) : (
													<button
														type="button"
														onClick={() => setFeaturedImageId(item.id)}
														className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-on-accent transition-colors hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background"
													>
														Use as featured image
													</button>
												)}
												<button
													type="button"
													onClick={() => insertIntoContent(item)}
													className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-accent"
												>
													Insert into content
												</button>
												<button
													type="button"
													onClick={() => setMediaToDelete(item)}
													className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-600 hover:text-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-red-900 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-700 dark:hover:text-red-50"
												>
													Delete
												</button>
											</div>
										</div>
									))}
									{postMedia.length > 0 && (
										<p className="text-xs text-muted-foreground">Featured image applies on save.</p>
									)}
									<label className="flex w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border px-4 py-6 text-center transition-colors hover:bg-surface-elevated">
										<span className="text-sm font-medium text-foreground">Choose a file to upload</span>
										<span className="text-xs text-muted-foreground">Images or PDF, up to 10 MB</span>
										<input
											type="file"
											className="sr-only"
											accept="image/jpeg,image/png,image/gif,image/webp,image/avif,application/pdf"
											disabled={uploadingMedia}
											onChange={(event) => {
												const file = event.target.files?.[0];
												if (file) void handleUpload(file);
												event.target.value = '';
											}}
										/>
									</label>
									{uploadingMedia && <p className="text-xs text-muted-foreground">Uploading…</p>}
								</div>
							)}
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
									{STATUS_LABELS[option] ?? option}
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
							onClick={requestSave}
							disabled={saving}
							className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent transition-colors hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
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

			{mediaToDelete && (
				<ConfirmDialog
					title="Delete media?"
					message={`Delete "${mediaToDelete.filename}" from this post? This cannot be undone.`}
					onConfirm={() => void handleDeleteMedia(mediaToDelete)}
					onCancel={() => setMediaToDelete(null)}
				/>
			)}
			{confirmingSave && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm"
					role="dialog"
					aria-modal="true"
					onClick={() => setConfirmingSave(false)}
				>
					<div
						className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-lg"
						onClick={(event) => event.stopPropagation()}
					>
						<h2 className="text-base font-semibold text-foreground">
							{editingPostId ? 'Save changes?' : 'Create this post?'}
						</h2>
						<p className="mt-2 text-sm text-muted-foreground">
							{editingPostId ? 'Save changes to' : 'Create'}{' '}
							<span className="text-foreground">{title.trim() || 'this post'}</span> as{' '}
							<span className="text-foreground">{STATUS_LABELS[status] ?? status}</span> in{' '}
							<span className="text-foreground">
								{meta.publications.find((publication) => publication.id === publicationId)?.name ?? 'the selected publication'}
							</span>
							?
						</p>
						<div className="mt-5 flex justify-end gap-2">
							<button
								type="button"
								onClick={() => setConfirmingSave(false)}
								disabled={saving}
								className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-accent"
							>
								Cancel
							</button>
							<button
								type="button"
								disabled={saving}
								onClick={() => {
									setConfirmingSave(false);
									void save();
								}}
								className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent transition-colors hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
							>
								{editingPostId ? 'Confirm save' : 'Confirm create'}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

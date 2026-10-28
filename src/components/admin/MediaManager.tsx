import { useEffect, useState } from 'react';
import EmptyState from './EmptyState';
import LoadingImage from './LoadingImage';
import Pagination from './Pagination';
import { MONTHS, filterSelectClass, matchesMonthYear, yearsOf } from './filters';

interface MediaItem {
	id: string;
	postId: string | null;
	publicationId: string | null;
	filename: string;
	mimeType: string;
	size: number;
	url: string;
	external?: boolean;
	createdAt: string;
}

interface PostOption {
	id: string;
	title: string;
	slug: string;
	publicationId: string;
	tags: string[];
}

interface PublicationOption {
	id: string;
	name: string;
	slug: string;
}

interface Envelope<T> {
	success: boolean;
	data?: T;
	error?: { code?: string; message?: string };
}

const inputClass =
	'mt-0.5 w-full rounded border-border bg-background text-foreground shadow-sm sm:text-sm placeholder:text-muted-foreground focus:border-accent focus:ring-accent';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(path, { credentials: 'same-origin', ...init });
	if (response.status === 401) {
		window.location.href = '/admin/login';
		throw new Error('Authentication required.');
	}
	const body = (await response.json()) as Envelope<T>;
	if (!response.ok || !body.success) {
		throw new Error(body.error?.message ?? `Request failed (HTTP ${response.status}).`);
	}
	return body.data as T;
}

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function MediaManager() {
	const [items, setItems] = useState<MediaItem[] | null>(null);
	const [posts, setPosts] = useState<PostOption[] | null>(null);
	const [publications, setPublications] = useState<PublicationOption[]>([]);
	const [publicationId, setPublicationId] = useState('');
	const [postId, setPostId] = useState('');
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [page, setPage] = useState(1);
	const [previewImage, setPreviewImage] = useState<MediaItem | null>(null);
	const [uploadOpen, setUploadOpen] = useState(false);
	const [pendingFile, setPendingFile] = useState<File | null>(null);
	const [confirming, setConfirming] = useState(false);
	const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
	const [pageSize, setPageSize] = useState(12);
	const [publicationFilter, setPublicationFilter] = useState('all');
	const [monthFilter, setMonthFilter] = useState('all');
	const [yearFilter, setYearFilter] = useState('all');

	useEffect(() => {
		let cancelled = false;
		async function loadAllMedia(): Promise<{ media: MediaItem[] }> {
			const all: MediaItem[] = [];
			const limit = 100;
			for (let offset = 0; ; offset += limit) {
				const result = await request<{ media: MediaItem[] }>(`/api/admin/media?limit=${limit}&offset=${offset}`);
				all.push(...result.media);
				if (result.media.length < limit) break;
			}
			return { media: all };
		}
		Promise.all([
			loadAllMedia(),
			request<{ posts: PostOption[] }>('/api/admin/posts?limit=100'),
			request<{ publications: PublicationOption[] }>('/api/admin/posts/meta'),
		])
			.then(([mediaResult, postsResult, meta]) => {
				if (cancelled) return;
				setItems(mediaResult.media);
				setPosts(postsResult.posts);
				setPublications(meta.publications);
				if (meta.publications.length > 0) {
					setPublicationId(meta.publications[0].id);
				}
			})
			.catch((reason: unknown) => {
				if (!cancelled) setError(reason instanceof Error ? reason.message : 'Failed to load media.');
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!previewImage && !uploadOpen) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			setPreviewImage(null);
			setUploadOpen(false);
			setPendingFile(null);
			setConfirming(false);
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [previewImage, uploadOpen]);

	useEffect(() => {
		const button = document.getElementById('upload-media-button');
		if (!button) return;
		const onClick = () => setUploadOpen(true);
		button.addEventListener('click', onClick);
		return () => button.removeEventListener('click', onClick);
	}, []);

	useEffect(() => {
		if (!pendingFile) {
			setFilePreviewUrl(null);
			return;
		}
		const url = URL.createObjectURL(pendingFile);
		setFilePreviewUrl(url);
		return () => URL.revokeObjectURL(url);
	}, [pendingFile]);

	const postsForPublication = (posts ?? []).filter((post) => post.publicationId === publicationId);

	function closeUploadModal() {
		setUploadOpen(false);
		setPendingFile(null);
		setConfirming(false);
	}

	/** Save validates the full selection before the confirmation step. */
	function handleSave() {
		if (!publicationId) {
			setError('Choose a publication before saving.');
			return;
		}
		if (!postId) {
			setError('Choose a post before saving.');
			return;
		}
		if (!pendingFile) {
			setError('Choose a file before saving.');
			return;
		}
		setError(null);
		setConfirming(true);
	}

	async function upload(file: File) {
		if (!postId) {
			setError('Select a post to attach the media to.');
			return;
		}
		if (!publicationId) {
			setError('Select a publication.');
			return;
		}
		setUploading(true);
		setError(null);
		setNotice(null);
		try {
			const formData = new FormData();
			formData.append('file', file);
			formData.append('postId', postId);
			formData.append('publicationId', publicationId);
			const result = await request<{ media: MediaItem }>('/api/admin/media', {
				method: 'POST',
				body: formData,
			});
			setNotice(`Uploaded ${result.media.filename}.`);
			setItems((current) => (current ? [result.media, ...current] : [result.media]));
			setPendingFile(null);
			setConfirming(false);
			setUploadOpen(false);
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : 'Failed to upload media.');
		} finally {
			setUploading(false);
		}
	}

	if (!items) {
		return <p className="text-sm text-muted-foreground">Loading…</p>;
	}

	const itemDate = (item: MediaItem): Date | null => {
		const date = new Date(item.createdAt);
		return Number.isNaN(date.getTime()) ? null : date;
	};
	const filtered = items.filter(
		(item) =>
			(publicationFilter === 'all' || item.publicationId === publicationFilter) &&
			matchesMonthYear(itemDate(item), monthFilter, yearFilter)
	);
	const years = yearsOf(items.map(itemDate));

	const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
	const currentPage = Math.min(page, totalPages);
	const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

	const clearFilters = () => {
		setPublicationFilter('all');
		setMonthFilter('all');
		setYearFilter('all');
		setPage(1);
	};

	const publicationName = (id: string | null) => publications.find((p) => p.id === id)?.name ?? '—';
	const postTitle = (id: string | null) => posts?.find((p) => p.id === id)?.title ?? '—';

	return (
		<div className="space-y-6">
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
						<img src={previewImage.url} alt={previewImage.filename} className="max-h-[75vh] w-auto rounded-md" />
						<figcaption className="mt-2 flex items-center justify-between gap-4 text-xs text-muted-foreground">
							<span>{previewImage.external ? 'Blogger-hosted' : previewImage.filename}</span>
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
			{uploadOpen && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm"
					role="dialog"
					aria-modal="true"
					onClick={closeUploadModal}
				>
					<div
						className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-lg"
						onClick={(event) => event.stopPropagation()}
					>
						<h2 className="text-base font-semibold text-foreground">Upload media</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							Media belongs to a post and that post's publication (one media item per post).
						</p>
						{error && (
							<p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-foreground" role="alert">
								{error}
							</p>
						)}
						{confirming && pendingFile ? (
							<div className="mt-4 rounded-lg border border-border bg-background p-4">
								<p className="text-sm font-medium text-foreground">Confirm upload</p>
								<p className="mt-1 text-sm text-muted-foreground">
									Upload {pendingFile.name} ({formatSize(pendingFile.size)}) to{' '}
									<span className="text-foreground">{postTitle(postId)}</span> in{' '}
									<span className="text-foreground">{publicationName(publicationId)}</span>?
								</p>
								<div className="mt-4 flex gap-2">
									<button
										type="button"
										disabled={uploading}
										onClick={() => void upload(pendingFile)}
										className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent transition-colors hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent disabled:pointer-events-none disabled:opacity-60"
									>
										{uploading ? 'Uploading…' : 'Confirm upload'}
									</button>
									<button
										type="button"
										disabled={uploading}
										onClick={() => setConfirming(false)}
										className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-accent"
									>
										Cancel
									</button>
								</div>
							</div>
						) : (
							<>
								<div className="mt-4 space-y-4">
									<div>
										<label htmlFor="media-publication" className="block text-sm font-medium text-foreground">
											Publication
										</label>
										<select
											id="media-publication"
											value={publicationId}
											onChange={(event) => {
												setPublicationId(event.target.value);
												setPostId('');
											}}
											className={inputClass}
										>
											<option value="">Select a publication</option>
											{publications.map((publication) => (
												<option key={publication.id} value={publication.id}>
													{publication.name}
												</option>
											))}
										</select>
									</div>
									<div>
										<label htmlFor="media-post" className="block text-sm font-medium text-foreground">
											Post
										</label>
										<select
											id="media-post"
											value={postId}
											onChange={(event) => setPostId(event.target.value)}
											className={inputClass}
										>
											<option value="">Select a post</option>
											{postsForPublication.map((post) => (
												<option key={post.id} value={post.id}>
													{post.title}
												</option>
											))}
										</select>
									</div>
									{pendingFile ? (
										// The chosen file is temporary until confirmed; its preview
										// takes the uploader's place.
										<div className="rounded-lg border border-border p-3">
											{filePreviewUrl && pendingFile.type.startsWith('image/') ? (
												<img src={filePreviewUrl} alt={pendingFile.name} className="max-h-40 w-full rounded object-cover" />
											) : (
												<div className="flex h-24 w-full items-center justify-center rounded bg-surface-elevated">
													<span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
														{pendingFile.type === 'application/pdf' ? 'PDF' : 'File'}
													</span>
												</div>
											)}
											<div className="mt-2 flex items-center justify-between gap-3">
												<p className="truncate text-xs text-muted-foreground" title={pendingFile.name}>
													{pendingFile.name} · {formatSize(pendingFile.size)} · not uploaded yet
												</p>
												<button
													type="button"
													onClick={() => setPendingFile(null)}
													className="shrink-0 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-surface-elevated"
												>
													Remove
												</button>
											</div>
										</div>
									) : (
										<label className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center hover:bg-surface-elevated">
											<span className="text-sm font-medium text-foreground">Choose a file to upload</span>
											<span className="text-xs text-muted-foreground">Images (JPEG, PNG, GIF, WebP, AVIF) or PDF · up to 10 MB</span>
											<input
												type="file"
												className="sr-only"
												accept="image/jpeg,image/png,image/gif,image/webp,image/avif,application/pdf"
												onChange={(event) => {
													const file = event.target.files?.[0];
													if (file) setPendingFile(file);
													event.target.value = '';
												}}
											/>
										</label>
									)}
								</div>
								<div className="mt-5 flex justify-end gap-2">
									<button
										type="button"
										onClick={closeUploadModal}
										className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-accent"
									>
										Close
									</button>
									<button
										type="button"
										onClick={handleSave}
										className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent transition-colors hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background"
									>
										Save
									</button>
								</div>
							</>
						)}
					</div>
				</div>
			)}
			{error && !uploadOpen && (
				<p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-foreground" role="alert">
					{error}
				</p>
			)}
			{notice && <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-foreground">{notice}</p>}

			<div className="flex flex-wrap items-end gap-4">
					<label htmlFor="media-filter-publication" className="block w-64">
						<span className="text-sm font-medium text-foreground">Publication</span>
						<select
							id="media-filter-publication"
							value={publicationFilter}
							onChange={(event) => {
								setPublicationFilter(event.target.value);
								setPage(1);
							}}
							className={filterSelectClass}
						>
							<option value="all">All publications</option>
							{publications.map((publication) => (
								<option key={publication.id} value={publication.id}>
									{publication.name}
								</option>
							))}
						</select>
					</label>
					<label htmlFor="media-filter-month" className="block w-44">
						<span className="text-sm font-medium text-foreground">Month</span>
						<select
							id="media-filter-month"
							value={monthFilter}
							onChange={(event) => {
								setMonthFilter(event.target.value);
								setPage(1);
							}}
							className={filterSelectClass}
						>
							<option value="all">All months</option>
							{MONTHS.map((month) => (
								<option key={month.value} value={month.value}>
									{month.label}
								</option>
							))}
						</select>
					</label>
					<label htmlFor="media-filter-year" className="block w-44">
						<span className="text-sm font-medium text-foreground">Year</span>
						<select
							id="media-filter-year"
							value={yearFilter}
							onChange={(event) => {
								setYearFilter(event.target.value);
								setPage(1);
							}}
							className={filterSelectClass}
						>
							<option value="all">All years</option>
							{years.map((year) => (
								<option key={year} value={year}>
									{year}
								</option>
							))}
						</select>
					</label>
					<button
						type="button"
						onClick={clearFilters}
						className="rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-accent"
					>
						Clear filters
					</button>
			</div>

			<div>
				{filtered.length === 0 ? (
					<EmptyState icon={<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>} title={items.length === 0 ? 'No media yet' : 'No media match these filters'} description={items.length === 0 ? 'Use the Upload media button, or attach media from the post editor.' : 'Try a different publication, month, or year, or clear the filters.'} />
				) : (
					<ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{pageItems.map((item) => {
							const post = posts?.find((candidate) => candidate.id === item.postId);
							return (
								<li key={item.id}>
									{/* Blog card: media image, post title, tags, View post action. */}
									<article className="flex h-full flex-col overflow-hidden rounded-md border border-border bg-surface shadow-sm">
										{item.mimeType === 'application/pdf' ? (
											<a href={item.url} target="_blank" rel="noopener noreferrer" className="block" title={item.filename}>
												<div className="flex h-40 w-full items-center justify-center bg-surface-elevated">
													<span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">PDF</span>
												</div>
											</a>
										) : (
											// Imported Blogger media has an unknown mime type until it is
											// localized into R2, so render everything that is not a PDF;
											// LoadingImage falls back to a glyph if it cannot render.
											<LoadingImage src={item.url} alt={item.filename} wrapperClassName="h-40 w-full" />
										)}
										<div className="flex flex-1 flex-col p-4">
											<h3 className="font-serif text-base font-semibold text-pretty text-foreground">
												{post?.title ?? postTitle(item.postId)}
											</h3>
											<p className="mt-1 truncate text-xs text-muted-foreground" title={item.external ? undefined : item.filename}>
												{publicationName(item.publicationId)} ·{' '}
												{item.external
													? `Blogger-hosted · ${formatDate(item.createdAt)}`
													: `${item.filename}${item.size > 0 ? ` · ${formatSize(item.size)}` : ''} · ${formatDate(item.createdAt)}`}
											</p>
											<div className="mt-3 flex flex-1 flex-wrap content-start gap-1.5">
												{post?.tags.map((tag) => (
													<span
														key={tag}
														className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs whitespace-nowrap text-accent-foreground"
													>
														{tag}
													</span>
												))}
											</div>
											<div className="mt-4 flex flex-wrap items-center gap-2">
												{item.postId && (
													<a
														href={`/admin/posts/${item.postId}/view`}
														className="inline-flex items-center gap-1.5 rounded-md border border-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent hover:text-on-accent focus:outline-none focus:ring-2 focus:ring-accent"
													>
														View post
														<svg
															aria-hidden="true"
															xmlns="http://www.w3.org/2000/svg"
															viewBox="0 0 24 24"
															fill="none"
															stroke="currentColor"
															strokeWidth="2"
															strokeLinecap="round"
															strokeLinejoin="round"
															className="size-4"
														>
															<path d="M5 12h14" />
															<path d="m12 5 7 7-7 7" />
														</svg>
													</a>
												)}
												{item.mimeType !== 'application/pdf' && (
													<button
														type="button"
														onClick={() => setPreviewImage(item)}
														className="inline-flex items-center gap-1.5 rounded-md border border-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent hover:text-on-accent focus:outline-none focus:ring-2 focus:ring-accent"
													>
														View image
														<svg
															aria-hidden="true"
															xmlns="http://www.w3.org/2000/svg"
															viewBox="0 0 24 24"
															fill="none"
															stroke="currentColor"
															strokeWidth="2"
															strokeLinecap="round"
															strokeLinejoin="round"
															className="size-4"
														>
															<path d="M5 12h14" />
															<path d="m12 5 7 7-7 7" />
														</svg>
													</button>
												)}
											</div>
										</div>
									</article>
								</li>
							);
						})}
					</ul>
				)}
				<div className="mt-4">
					<Pagination
						totalItems={filtered.length}
						page={currentPage}
						pageSize={pageSize}
						onPageChange={setPage}
						onPageSizeChange={(size) => {
							setPageSize(size);
							setPage(1);
						}}
						itemsLabel="media items"
						sizeOptions={[12, 24, 48]}
					/>
				</div>
			</div>
		</div>
	);
}

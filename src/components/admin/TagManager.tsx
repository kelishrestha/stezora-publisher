import { useEffect, useState } from 'react';
import EmptyState from './EmptyState';
import Pagination from './Pagination';
import { MONTHS, filterSelectClass, matchesMonthYear, yearsOf } from './filters';

interface TagRecord {
	id: string;
	publication_id: string;
	name: string;
	slug: string;
	created_at: string | null;
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

function tagDate(tag: TagRecord): Date | null {
	if (!tag.created_at) return null;
	const date = new Date(tag.created_at);
	return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: string | null): string | null {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function TagIcon({ className = 'size-4' }: { className?: string }) {
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
			<path d="M9 5H2v7l6.29 6.29c.94.94 2.48.94 3.42 0l3.58-3.58c.94-.94.94-2.48 0-3.42L9 5Z" />
			<path d="M6 9.01V9" />
		</svg>
	);
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

function TrashIcon({ className = 'size-4' }: { className?: string }) {
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
			<path d="M3 6h18" />
			<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
			<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
			<line x1="10" x2="10" y1="11" y2="17" />
			<line x1="14" x2="14" y1="11" y2="17" />
		</svg>
	);
}

const iconButtonClass =
	'rounded-md border border-accent bg-accent-soft p-2 text-accent-foreground transition-colors hover:bg-accent hover:text-on-accent focus:outline-none focus:ring-2 focus:ring-accent';

export default function TagManager() {
	const [tags, setTags] = useState<TagRecord[] | null>(null);
	const [publications, setPublications] = useState<PublicationOption[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	// Create/edit modal.
	const [modalOpen, setModalOpen] = useState(false);
	const [editing, setEditing] = useState<TagRecord | null>(null);
	const [formPublicationId, setFormPublicationId] = useState('');
	const [name, setName] = useState('');

	// Filters, tabs (publication tabs double as the publication filter).
	const [publicationFilter, setPublicationFilter] = useState('all');
	const [monthFilter, setMonthFilter] = useState('all');
	const [yearFilter, setYearFilter] = useState('all');
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);

	useEffect(() => {
		let cancelled = false;
		Promise.all([
			request<{ tags: TagRecord[] }>('/api/admin/tags'),
			request<{ publications: PublicationOption[] }>('/api/admin/posts/meta'),
		])
			.then(([tagsResult, meta]) => {
				if (cancelled) return;
				setTags(tagsResult.tags);
				setPublications(meta.publications);
			})
			.catch((reason: unknown) => {
				if (!cancelled) setError(reason instanceof Error ? reason.message : 'Failed to load tags.');
			});
		return () => {
			cancelled = true;
		};
	}, []);

	// The New tag button lives in the page heading (Astro shell).
	useEffect(() => {
		const button = document.getElementById('new-tag-button');
		if (!button) return;
		const onClick = () => openCreate();
		button.addEventListener('click', onClick);
		return () => button.removeEventListener('click', onClick);
	}, [publications]);

	useEffect(() => {
		if (!modalOpen) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') closeModal();
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [modalOpen]);

	function openCreate() {
		setEditing(null);
		setName('');
		setFormPublicationId((current) => current || publications[0]?.id || '');
		setError(null);
		setModalOpen(true);
	}

	function openEdit(tag: TagRecord) {
		setEditing(tag);
		setName(tag.name);
		setFormPublicationId(tag.publication_id);
		setError(null);
		setModalOpen(true);
	}

	function closeModal() {
		setModalOpen(false);
		setEditing(null);
		setName('');
	}

	async function refresh() {
		const result = await request<{ tags: TagRecord[] }>('/api/admin/tags');
		setTags(result.tags);
	}

	async function submit() {
		if (!formPublicationId) {
			setError('Select a publication.');
			return;
		}
		if (!name.trim()) {
			setError('Enter a tag name.');
			return;
		}
		setBusy(true);
		setError(null);
		setNotice(null);
		try {
			if (editing) {
				await request(`/api/admin/tags/${editing.id}`, {
					method: 'PUT',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ name }),
				});
				setNotice('Tag updated.');
			} else {
				await request('/api/admin/tags', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ publicationId: formPublicationId, name }),
				});
				setNotice('Tag created.');
			}
			closeModal();
			await refresh();
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : 'Failed to save tag.');
		} finally {
			setBusy(false);
		}
	}

	async function remove(tag: TagRecord) {
		if (!window.confirm(`Delete the tag "${tag.name}"?`)) return;
		setBusy(true);
		setError(null);
		setNotice(null);
		try {
			await request(`/api/admin/tags/${tag.id}`, { method: 'DELETE' });
			setNotice('Tag deleted.');
			await refresh();
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : 'Failed to delete tag.');
		} finally {
			setBusy(false);
		}
	}

	if (!tags) {
		return <p className="text-sm text-muted-foreground">Loading…</p>;
	}

	// Month and year narrow the pool; the publication tabs count within it.
	const pool = tags.filter((tag) => matchesMonthYear(tagDate(tag), monthFilter, yearFilter));
	const counts: Record<string, number> = { all: pool.length };
	for (const publication of publications) {
		counts[publication.id] = pool.filter((tag) => tag.publication_id === publication.id).length;
	}

	const years = yearsOf(tags.map(tagDate));

	const visible = publicationFilter === 'all' ? pool : pool.filter((tag) => tag.publication_id === publicationFilter);

	const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
	const currentPage = Math.min(page, totalPages);
	const pageItems = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);

	const publicationName = (id: string) => publications.find((p) => p.id === id)?.name ?? id;

	const tabs = [{ id: 'all', name: 'All' }, ...publications];

	return (
		<div className="space-y-4">
			{modalOpen && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm"
					role="dialog"
					aria-modal="true"
					onClick={closeModal}
				>
					<div
						className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-lg"
						onClick={(event) => event.stopPropagation()}
					>
						<h2 className="text-base font-semibold text-foreground">
							{editing ? `Edit "${editing.name}"` : 'New tag'}
						</h2>
						{error && (
							<p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-foreground" role="alert">
								{error}
							</p>
						)}
						<div className="mt-4 space-y-4">
							<div>
								<label htmlFor="tag-publication" className="block text-sm font-medium text-foreground">
									Publication
								</label>
								<select
									id="tag-publication"
									value={formPublicationId}
									onChange={(event) => setFormPublicationId(event.target.value)}
									className={inputClass}
									disabled={Boolean(editing)}
								>
									{publications.map((publication) => (
										<option key={publication.id} value={publication.id}>
											{publication.name}
										</option>
									))}
								</select>
							</div>
							<div>
								<label htmlFor="tag-name" className="block text-sm font-medium text-foreground">
									Name
								</label>
								<input
									id="tag-name"
									value={name}
									onChange={(event) => setName(event.target.value)}
									className={inputClass}
									placeholder="Tag name"
								/>
							</div>
						</div>
						<div className="mt-5 flex justify-end gap-2">
							<button
								type="button"
								onClick={closeModal}
								disabled={busy}
								className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-accent"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={() => void submit()}
								disabled={busy}
								className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent transition-colors hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
							>
								{busy ? 'Saving…' : editing ? 'Save' : 'Create'}
							</button>
						</div>
					</div>
				</div>
			)}

			{error && !modalOpen && (
				<p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-foreground" role="alert">
					{error}
				</p>
			)}
			{notice && <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-foreground">{notice}</p>}

			{/* Filters (HyperUI selects): publication, month, year. */}
			<div className="flex flex-wrap items-end gap-4 pb-4">
				<label htmlFor="tag-filter-publication" className="block w-44">
					<span className="text-sm font-medium text-foreground">Publication</span>
					<select
						id="tag-filter-publication"
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
				<label htmlFor="tag-filter-month" className="block w-44">
					<span className="text-sm font-medium text-foreground">Month</span>
					<select
						id="tag-filter-month"
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
				<label htmlFor="tag-filter-year" className="block w-44">
					<span className="text-sm font-medium text-foreground">Year</span>
					<select
						id="tag-filter-year"
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
					onClick={() => {
						setPublicationFilter('all');
						setMonthFilter('all');
						setYearFilter('all');
						setPage(1);
					}}
					className="rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-accent"
				>
					Clear filters
				</button>
			</div>

			{/* Publication tabs (HyperUI border-bottom style) with count badges. */}
			<div className="border-b border-border">
				<nav aria-label="Tag publication" className="-mb-px flex flex-wrap gap-4 overflow-x-auto sm:gap-6">
					{tabs.map((tab) => {
						const active = publicationFilter === tab.id;
						return (
							<button
								key={tab.id}
								type="button"
								onClick={() => {
									setPublicationFilter(tab.id);
									setPage(1);
								}}
								className={`flex shrink-0 items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
									active
										? 'border-accent text-accent-foreground'
										: 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
								}`}
								aria-current={active ? 'page' : undefined}
							>
								<TagIcon />
								{tab.name}
								<span
									className={`rounded-full px-2 py-0.5 text-xs ${
										active ? 'bg-accent-soft text-accent-foreground' : 'bg-muted text-muted-foreground'
									}`}
								>
									{counts[tab.id] ?? 0}
								</span>
							</button>
						);
					})}
				</nav>
			</div>

			<div className="rounded-md border border-border bg-surface shadow-sm">
				{visible.length === 0 ? (
					tags.length === 0 ? (
						<EmptyState
							icon={<TagIcon className="size-5" />}
							title="No tags yet"
							description="Create a tag with the New tag button to start organizing posts."
						/>
					) : (
						<EmptyState
							icon={<TagIcon className="size-5" />}
							title="No tags match these filters"
							description="Try a different publication, month, or year, or clear the filters."
						/>
					)
				) : (
					<ul className="divide-y divide-border">
						{pageItems.map((tag) => (
							<li key={tag.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
								<div className="min-w-0">
									<p className="truncate font-medium text-foreground">{tag.name}</p>
									<p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
										<span className="rounded-full bg-accent-soft px-2.5 py-0.5 whitespace-nowrap text-accent-foreground">
											{publicationName(tag.publication_id)}
										</span>
										{formatDate(tag.created_at) && <span>Created on {formatDate(tag.created_at)}</span>}
									</p>
								</div>
								<div className="flex shrink-0 gap-2">
									<button
										type="button"
										onClick={() => openEdit(tag)}
										aria-label={`Edit ${tag.name}`}
										title="Edit"
										className={iconButtonClass}
									>
										<PencilIcon />
									</button>
									<button
										type="button"
										onClick={() => void remove(tag)}
										disabled={busy}
										aria-label={`Delete ${tag.name}`}
										title="Delete"
										className={iconButtonClass}
									>
										<TrashIcon />
									</button>
								</div>
							</li>
						))}
					</ul>
				)}
			</div>

			<Pagination
				totalItems={visible.length}
				page={currentPage}
				pageSize={pageSize}
				onPageChange={setPage}
				onPageSizeChange={(size) => {
					setPageSize(size);
					setPage(1);
				}}
				itemsLabel="tags"
			/>
		</div>
	);
}

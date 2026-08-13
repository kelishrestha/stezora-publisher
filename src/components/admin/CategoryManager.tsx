import { useEffect, useMemo, useState } from 'react';

interface PublicationOption {
	id: string;
	name: string;
	slug: string;
}

interface CategoryRecord {
	id: string;
	publication_id: string;
	name: string;
	slug: string;
}

interface Envelope<T> {
	success: boolean;
	data?: T;
	error?: { code?: string; message?: string };
}

const inputClass =
	'mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none';

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

export default function CategoryManager() {
	const [categories, setCategories] = useState<CategoryRecord[] | null>(null);
	const [publications, setPublications] = useState<PublicationOption[]>([]);
	const [publicationId, setPublicationId] = useState('');
	const [name, setName] = useState('');
	const [editing, setEditing] = useState<CategoryRecord | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		let cancelled = false;
		Promise.all([
			request<{ categories: CategoryRecord[] }>('/api/admin/categories'),
			request<{ publications: PublicationOption[] }>('/api/admin/posts/meta'),
		])
			.then(([categoriesResult, meta]) => {
				if (cancelled) return;
				setCategories(categoriesResult.categories);
				setPublications(meta.publications);
				if (meta.publications.length > 0) {
					setPublicationId(meta.publications[0].id);
				}
			})
			.catch((reason: unknown) => {
				if (!cancelled) setError(reason instanceof Error ? reason.message : 'Failed to load categories.');
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const categoriesByPublication = useMemo(() => {
		if (!categories) return [];
		if (!publicationId) return categories;
		return categories.filter((category) => category.publication_id === publicationId);
	}, [categories, publicationId]);

	async function refresh() {
		const result = await request<{ categories: CategoryRecord[] }>('/api/admin/categories');
		setCategories(result.categories);
	}

	async function submit() {
		if (!publicationId) {
			setError('Select a publication.');
			return;
		}
		setBusy(true);
		setError(null);
		setNotice(null);
		try {
			if (editing) {
				await request(`/api/admin/categories/${editing.id}`, {
					method: 'PUT',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ name }),
				});
				setNotice('Category updated.');
			} else {
				await request('/api/admin/categories', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ publicationId, name }),
				});
				setNotice('Category created.');
			}
			setName('');
			setEditing(null);
			await refresh();
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : 'Failed to save category.');
		} finally {
			setBusy(false);
		}
	}

	async function remove(category: CategoryRecord) {
		if (!window.confirm(`Delete the category "${category.name}"?`)) return;
		setBusy(true);
		setError(null);
		setNotice(null);
		try {
			await request(`/api/admin/categories/${category.id}`, { method: 'DELETE' });
			setNotice('Category deleted.');
			await refresh();
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : 'Failed to delete category.');
		} finally {
			setBusy(false);
		}
	}

	if (!categories) {
		return <p className="text-sm text-muted-foreground">Loading…</p>;
	}

	return (
		<div className="space-y-6">
			{error && (
				<p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-foreground" role="alert">
					{error}
				</p>
			)}
			{notice && <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-foreground">{notice}</p>}

			<div className="rounded-xl border border-border bg-surface p-5">
				<h2 className="text-base font-semibold text-foreground">{editing ? `Edit "${editing.name}"` : 'New category'}</h2>
				<div className="mt-4 grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)_auto]">
					<div>
						<label htmlFor="category-publication" className="block text-sm font-medium text-foreground">
							Publication
						</label>
						<select
							id="category-publication"
							value={publicationId}
							onChange={(event) => setPublicationId(event.target.value)}
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
						<label htmlFor="category-name" className="block text-sm font-medium text-foreground">
							Name
						</label>
						<input
							id="category-name"
							value={name}
							onChange={(event) => setName(event.target.value)}
							className={inputClass}
							placeholder="Category name"
						/>
					</div>
					<div className="flex items-end gap-2">
						<button
							type="button"
							onClick={() => void submit()}
							disabled={busy}
							className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{busy ? 'Saving…' : editing ? 'Save' : 'Create'}
						</button>
						{editing && (
							<button
								type="button"
								onClick={() => {
									setEditing(null);
									setName('');
								}}
								className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-elevated"
							>
								Cancel
							</button>
						)}
					</div>
				</div>
			</div>

			<div className="rounded-xl border border-border bg-surface">
				<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
					<h2 className="text-base font-semibold text-foreground">Categories</h2>
					<div className="flex gap-1 text-sm">
						{publications.map((publication) => (
							<button
								key={publication.id}
								type="button"
								onClick={() => setPublicationId(publication.id)}
								className={`rounded-full px-3 py-1 ${
									publicationId === publication.id
										? 'bg-accent-soft text-accent-foreground'
										: 'text-muted-foreground hover:bg-surface-elevated hover:text-foreground'
								}`}
							>
								{publication.name}
							</button>
						))}
						{publicationId && (
							<button
								type="button"
								onClick={() => setPublicationId('')}
								className="rounded-full px-3 py-1 text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
							>
								All
							</button>
						)}
					</div>
				</div>
				{categoriesByPublication.length === 0 ? (
					<p className="px-5 py-8 text-sm text-muted-foreground">No categories yet.</p>
				) : (
					<ul className="divide-y divide-border">
						{categoriesByPublication.map((category) => (
							<li key={category.id} className="flex items-center justify-between gap-4 px-5 py-3">
								<div className="min-w-0">
									<p className="truncate font-medium text-foreground">{category.name}</p>
									<p className="text-xs text-muted-foreground">/{category.slug}</p>
								</div>
								<div className="flex shrink-0 gap-2">
									<button
										type="button"
										onClick={() => {
											setEditing(category);
											setName(category.name);
										}}
										className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground hover:bg-surface-elevated"
									>
										Edit
									</button>
									<button
										type="button"
										onClick={() => void remove(category)}
										className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground hover:bg-surface-elevated"
									>
										Delete
									</button>
								</div>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}
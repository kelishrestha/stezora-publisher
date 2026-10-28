import { useEffect, useMemo, useState } from 'react';

interface TagRecord {
	id: string;
	publication_id: string;
	name: string;
	slug: string;
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

export default function TagManager() {
	const [tags, setTags] = useState<TagRecord[] | null>(null);
	const [publications, setPublications] = useState<PublicationOption[]>([]);
	const [publicationId, setPublicationId] = useState('');
	const [name, setName] = useState('');
	const [editing, setEditing] = useState<TagRecord | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

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
				if (meta.publications.length > 0) {
					setPublicationId(meta.publications[0].id);
				}
			})
			.catch((reason: unknown) => {
				if (!cancelled) setError(reason instanceof Error ? reason.message : 'Failed to load tags.');
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const tagsByPublication = useMemo(() => {
		if (!tags) return [];
		if (!publicationId) return tags;
		return tags.filter((tag) => tag.publication_id === publicationId);
	}, [tags, publicationId]);

	async function refresh() {
		const result = await request<{ tags: TagRecord[] }>('/api/admin/tags');
		setTags(result.tags);
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
					body: JSON.stringify({ publicationId, name }),
				});
				setNotice('Tag created.');
			}
			setName('');
			setEditing(null);
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

	return (
		<div className="space-y-6">
			{error && (
				<p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-foreground" role="alert">
					{error}
				</p>
			)}
			{notice && <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-foreground">{notice}</p>}

			<div className="rounded-md border border-border bg-surface shadow-sm p-5">
				<h2 className="text-base font-semibold text-foreground">{editing ? `Edit "${editing.name}"` : 'New tag'}</h2>
				<div className="mt-4 grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)_auto]">
					<div>
						<label htmlFor="tag-publication" className="block text-sm font-medium text-foreground">
							Publication
						</label>
						<select
							id="tag-publication"
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
					<div className="flex items-end gap-2">
						<button
							type="button"
							onClick={() => void submit()}
							disabled={busy}
							className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent transition-colors hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
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

			<div className="rounded-md border border-border bg-surface shadow-sm">
				<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
					<h2 className="text-base font-semibold text-foreground">Tags</h2>
					<div className="flex gap-1 text-sm">
						<button
							type="button"
							onClick={() => setPublicationId('')}
							className={`rounded-full px-3 py-1 ${
								publicationId === ''
									? 'bg-accent-soft text-accent-foreground'
									: 'text-muted-foreground hover:bg-surface-elevated hover:text-foreground'
							}`}
						>
							All
						</button>
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
					</div>
				</div>
				{tagsByPublication.length === 0 ? (
					<p className="px-5 py-8 text-sm text-muted-foreground">No tags yet.</p>
				) : (
					<ul className="divide-y divide-border">
						{tagsByPublication.map((tag) => (
							<li key={tag.id} className="flex items-center justify-between gap-4 px-3 py-2 whitespace-nowrap">
								<div className="min-w-0">
									<p className="truncate font-medium text-foreground">{tag.name}</p>
									<p className="text-xs text-muted-foreground">/{tag.slug}</p>
								</div>
								<div className="flex shrink-0 gap-2">
									<button
										type="button"
										onClick={() => {
											setEditing(tag);
											setName(tag.name);
											setPublicationId(tag.publication_id);
										}}
										className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground hover:bg-surface-elevated"
									>
										Edit
									</button>
									<button
										type="button"
										onClick={() => void remove(tag)}
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
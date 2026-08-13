import { useEffect, useState } from 'react';

interface TagRecord {
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

export default function TagManager() {
	const [tags, setTags] = useState<TagRecord[] | null>(null);
	const [name, setName] = useState('');
	const [editing, setEditing] = useState<TagRecord | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		let cancelled = false;
		request<{ tags: TagRecord[] }>('/api/admin/tags')
			.then((result) => {
				if (!cancelled) setTags(result.tags);
			})
			.catch((reason: unknown) => {
				if (!cancelled) setError(reason instanceof Error ? reason.message : 'Failed to load tags.');
			});
		return () => {
			cancelled = true;
		};
	}, []);

	async function refresh() {
		const result = await request<{ tags: TagRecord[] }>('/api/admin/tags');
		setTags(result.tags);
	}

	async function submit() {
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
					body: JSON.stringify({ name }),
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

			<div className="rounded-xl border border-border bg-surface p-5">
				<h2 className="text-base font-semibold text-foreground">{editing ? `Edit "${editing.name}"` : 'New tag'}</h2>
				<div className="mt-4 flex gap-4">
					<div className="max-w-md flex-1">
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
				<h2 className="border-b border-border px-5 py-4 text-base font-semibold text-foreground">Tags</h2>
				{tags.length === 0 ? (
					<p className="px-5 py-8 text-sm text-muted-foreground">No tags yet.</p>
				) : (
					<ul className="divide-y divide-border">
						{tags.map((tag) => (
							<li key={tag.id} className="flex items-center justify-between gap-4 px-5 py-3">
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
import { useEffect, useState } from 'react';

interface MediaItem {
	id: string;
	postId: string | null;
	filename: string;
	mimeType: string;
	size: number;
	url: string;
	createdAt: string;
}

interface Envelope<T> {
	success: boolean;
	data?: T;
	error?: { code?: string; message?: string };
}

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

function isImage(mimeType: string): boolean {
	return mimeType.startsWith('image/');
}

export default function MediaManager() {
	const [items, setItems] = useState<MediaItem[] | null>(null);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		request<{ media: MediaItem[] }>('/api/admin/media')
			.then((result) => {
				if (!cancelled) setItems(result.media);
			})
			.catch((reason: unknown) => {
				if (!cancelled) setError(reason instanceof Error ? reason.message : 'Failed to load media.');
			});
		return () => {
			cancelled = true;
		};
	}, []);

	async function upload(file: File) {
		setUploading(true);
		setError(null);
		setNotice(null);
		try {
			const formData = new FormData();
			formData.append('file', file);
			const result = await request<{ media: MediaItem }>('/api/admin/media', {
				method: 'POST',
				body: formData,
			});
			setNotice(`Uploaded ${result.media.filename}.`);
			setItems((current) => (current ? [result.media, ...current] : [result.media]));
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : 'Failed to upload media.');
		} finally {
			setUploading(false);
		}
	}

	if (!items) {
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
				<h2 className="text-base font-semibold text-foreground">Upload</h2>
				<label className="mt-4 flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center hover:bg-surface-elevated">
					<span className="text-sm font-medium text-foreground">{uploading ? 'Uploading…' : 'Choose a file to upload'}</span>
					<span className="text-xs text-muted-foreground">Images (JPEG, PNG, GIF, WebP, AVIF) or PDF · up to 10 MB</span>
					<input
						type="file"
						className="sr-only"
						accept="image/jpeg,image/png,image/gif,image/webp,image/avif,application/pdf"
						disabled={uploading}
						onChange={(event) => {
							const file = event.target.files?.[0];
							if (file) void upload(file);
							event.target.value = '';
						}}
					/>
				</label>
			</div>

			<div className="rounded-xl border border-border bg-surface">
				<h2 className="border-b border-border px-5 py-4 text-base font-semibold text-foreground">All media</h2>
				{items.length === 0 ? (
					<p className="px-5 py-8 text-sm text-muted-foreground">No media uploaded yet.</p>
				) : (
					<ul className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-4">
						{items.map((item) => (
							<li key={item.id} className="bg-surface p-3">
								<a href={item.url} target="_blank" rel="noopener noreferrer" className="block">
									{isImage(item.mimeType) ? (
										<img
											src={item.url}
											alt={item.filename}
											loading="lazy"
											className="h-40 w-full rounded-md border border-border object-cover"
										/>
									) : (
										<div className="flex h-40 w-full items-center justify-center rounded-md border border-border bg-surface-elevated">
											<span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">PDF</span>
										</div>
									)}
								</a>
								<div className="mt-2 min-w-0">
									<p className="truncate text-sm font-medium text-foreground" title={item.filename}>
										{item.filename}
									</p>
									<p className="text-xs text-muted-foreground">
										{formatSize(item.size)} · {formatDate(item.createdAt)}
									</p>
								</div>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}
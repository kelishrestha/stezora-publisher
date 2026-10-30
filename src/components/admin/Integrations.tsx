import { useEffect, useState } from 'react';
import { Section } from './Section';
import Toast, { ToastStack } from './Toast';
import { useConfirm } from './useConfirm';
import { badgeClass, buttonClass, cardClass, modalOverlayClass, modalPanelClass } from '../ui/shared/classes';

interface BloggerStats {
	viewsAll: number | null;
	views30d: number | null;
	views7d: number | null;
	fetchedAt: string;
}

interface BloggerPublication {
	slug: string;
	name: string;
	blogHost: string | null;
	linkedPosts: number;
	stats: BloggerStats | null;
}

interface IntegrationsData {
	blogger: { connected: boolean; configured: boolean; canAuthorize: boolean; publications: BloggerPublication[] };
	neobook: { configured: boolean; profileUrl: string; books: number };
}

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
	state_mismatch: 'Authorization could not be verified. Please try again.',
	token_exchange_failed: 'Google rejected the authorization. Check the OAuth client and redirect URI.',
	no_refresh_token: 'Google did not return a refresh token. Try authorizing again.',
	not_configured: 'Blogger client id and secret are not configured on the server.',
	access_denied: 'Authorization was cancelled.',
};

interface NeobookSyncResult {
	items: number;
	postsCreated: number;
	contentUpdates: number;
	imagesAttached: number;
	tagsCreated: number;
	booksCreated: number;
	booksUpdated: number;
	unmatched: string[];
}

interface BloggerImportResult {
	includeDrafts: boolean;
	imported: number;
	skipped: number;
	statsUpdated: number;
	publications: Array<{ slug: string; name: string; linked: boolean; imported: number; skipped: number }>;
}

export default function Integrations() {
	const [data, setData] = useState<IntegrationsData | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [syncing, setSyncing] = useState(false);
	const [importing, setImporting] = useState(false);
	const [refreshingStats, setRefreshingStats] = useState(false);
	const [importOpen, setImportOpen] = useState(false);
	const [toast, setToast] = useState<{ tone: 'error' | 'success'; message: string } | null>(null);
	const { confirm, confirmDialog } = useConfirm();

	const loadData = () => {
		fetch('/api/admin/integrations', { credentials: 'same-origin' })
			.then((response) => {
				if (response.status === 401) {
					window.location.href = '/admin/login';
					return null;
				}
				if (!response.ok) throw new Error(`Failed to load integrations (HTTP ${response.status}).`);
				return response.json() as Promise<{ data: IntegrationsData }>;
			})
			.then((body) => {
				if (body) setData(body.data);
			})
			.catch((reason: unknown) => {
				setError(reason instanceof Error ? reason.message : 'Failed to load integrations.');
			});
	};

	useEffect(() => {
		loadData();
	}, []);

	// Surface the result of the OAuth redirect (blogger=authorized / blogger_error=...)
	// then strip the query so a refresh does not repeat the toast.
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		if (params.has('blogger')) {
			setToast({ tone: 'success', message: 'Blogger authorized. Import and statistics are now available.' });
		} else if (params.has('blogger_error')) {
			const code = params.get('blogger_error') ?? '';
			setToast({ tone: 'error', message: OAUTH_ERROR_MESSAGES[code] ?? `Authorization failed (${code}).` });
		} else {
			return;
		}
		params.delete('blogger');
		params.delete('blogger_error');
		const query = params.toString();
		window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}#blogger`);
	}, []);

	async function syncNeobook() {
		const confirmed = await confirm({
			title: 'Sync from Neobook?',
			message:
				'This pulls the latest revisions and attachments from the Neobook profile into the CMS. Matching posts are updated in place; the public site reflects changes on the next build.',
			confirmLabel: 'Sync now',
			tone: 'primary',
		});
		if (!confirmed) return;

		setSyncing(true);
		try {
			const response = await fetch('/api/admin/neobook/sync', { method: 'POST', credentials: 'same-origin' });
			if (response.status === 401) {
				window.location.href = '/admin/login';
				return;
			}
			if (!response.ok) throw new Error(`Sync failed (HTTP ${response.status}).`);
			const body = (await response.json()) as { data: NeobookSyncResult };
			const result = body.data;
			const parts = [
				`${result.postsCreated} created`,
				`${result.contentUpdates} updated`,
				`${result.imagesAttached} image${result.imagesAttached === 1 ? '' : 's'}`,
				`${result.tagsCreated} tag${result.tagsCreated === 1 ? '' : 's'}`,
				`${result.booksCreated + result.booksUpdated} book${result.booksCreated + result.booksUpdated === 1 ? '' : 's'}`,
			];
			const unmatched = result.unmatched.length > 0 ? ` (${result.unmatched.length} unmatched)` : '';
			setToast({ tone: 'success', message: `Synced ${result.items} item${result.items === 1 ? '' : 's'}: ${parts.join(', ')}.${unmatched}` });
			loadData();
		} catch (reason: unknown) {
			setToast({ tone: 'error', message: reason instanceof Error ? reason.message : 'Could not sync from Neobook.' });
		} finally {
			setSyncing(false);
		}
	}

	async function runImport(includeDrafts: boolean) {
		setImportOpen(false);
		const confirmed = await confirm({
			title: 'Import from Blogger?',
			message: includeDrafts
				? 'This imports published posts and drafts from the linked blogs. Posts already in the CMS are left untouched; only new posts are added.'
				: 'This imports published posts from the linked blogs. Posts already in the CMS are left untouched; only new posts are added.',
			confirmLabel: 'Import now',
			tone: 'primary',
		});
		if (!confirmed) return;

		setImporting(true);
		try {
			const response = await fetch('/api/admin/blogger/import', {
				method: 'POST',
				credentials: 'same-origin',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ includeDrafts }),
			});
			if (response.status === 401) {
				window.location.href = '/admin/login';
				return;
			}
			const body = (await response.json()) as { success: boolean; data?: BloggerImportResult; error?: { message?: string } };
			if (!response.ok || !body.data) {
				throw new Error(body.error?.message ?? `Import failed (HTTP ${response.status}).`);
			}
			const result = body.data;
			const skipped = result.skipped > 0 ? ` (${result.skipped} already present)` : '';
			const stats = result.statsUpdated > 0 ? ' Statistics updated.' : '';
			setToast({ tone: 'success', message: `Imported ${result.imported} new post${result.imported === 1 ? '' : 's'}.${skipped}${stats}` });
			loadData();
		} catch (reason: unknown) {
			setToast({ tone: 'error', message: reason instanceof Error ? reason.message : 'Could not import from Blogger.' });
		} finally {
			setImporting(false);
		}
	}

	async function refreshStats() {
		setRefreshingStats(true);
		try {
			const response = await fetch('/api/admin/blogger/stats', { method: 'POST', credentials: 'same-origin' });
			if (response.status === 401) {
				window.location.href = '/admin/login';
				return;
			}
			const body = (await response.json()) as { success: boolean; data?: { statsUpdated: number }; error?: { message?: string } };
			if (!response.ok || !body.data) {
				throw new Error(body.error?.message ?? `Could not refresh statistics (HTTP ${response.status}).`);
			}
			setToast({ tone: 'success', message: `Statistics refreshed for ${body.data.statsUpdated} blog${body.data.statsUpdated === 1 ? '' : 's'}.` });
			loadData();
		} catch (reason: unknown) {
			setToast({ tone: 'error', message: reason instanceof Error ? reason.message : 'Could not refresh statistics.' });
		} finally {
			setRefreshingStats(false);
		}
	}

	if (error) {
		return <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-foreground">{error}</p>;
	}

	return (
		<div className="max-w-2xl space-y-8">
			<Section id="blogger" title="Blogger integration">
				<div className={cardClass()}>
					<div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
						<div>
							<h3 className="text-sm font-semibold text-foreground">Blogger</h3>
							<p className="mt-0.5 text-xs text-muted-foreground">Posts are imported from Blogger into the CMS.</p>
						</div>
						{data && (
							<span className={data.blogger.configured ? badgeClass('success') : badgeClass('muted')}>
								{data.blogger.configured ? 'Connected' : data.blogger.canAuthorize ? 'Not authorized' : 'Not configured'}
							</span>
						)}
					</div>

					{data && !data.blogger.canAuthorize && (
						<p className="border-b border-border bg-amber-50 px-5 py-3 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
							Blogger client id and secret are not configured on the server, so authorization is unavailable. Set the Blogger OAuth secrets to enable it.
						</p>
					)}

					{data?.blogger.canAuthorize && (
						<div className="flex flex-col gap-2 border-b border-border px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
							<p className="text-muted-foreground">
								{data.blogger.configured ? 'Reconnect your Blogger account if authorization stops working.' : 'Connect your Blogger account to enable importing and statistics.'}
							</p>
							<a href="/api/admin/blogger/oauth/start" className={`${buttonClass('outline', 'sm')} shrink-0`}>
								Authorize
							</a>
						</div>
					)}

					<div className="flex flex-col gap-2 border-b border-border px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
						<p className="text-muted-foreground">Refresh the blog-level pageview totals shown below.</p>
						<button
							type="button"
							onClick={() => void refreshStats()}
							disabled={refreshingStats || !data || !data.blogger.configured}
							className={`${buttonClass('outline', 'sm')} shrink-0`}
						>
							{refreshingStats ? 'Refreshing…' : 'Refresh stats'}
						</button>
					</div>

					<div className="flex flex-col gap-2 border-b border-border px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
						<p className="text-muted-foreground">Import new posts from the linked blogs into the CMS.</p>
						<button
							type="button"
							onClick={() => setImportOpen(true)}
							disabled={importing || !data || !data.blogger.configured}
							className={`${buttonClass('accentOutline', 'sm')} shrink-0`}
						>
							{importing ? 'Importing…' : 'Import posts'}
						</button>
					</div>

					{!data ? (
						<div className="m-5 h-24 animate-pulse rounded-md bg-surface-elevated" />
					) : (
						<div className="overflow-x-auto">
							<table className="min-w-full divide-y divide-border text-left text-sm">
								<thead>
									<tr className="text-xs text-muted-foreground">
										<th className="px-5 py-2 font-medium">Publication</th>
										<th className="px-5 py-2 font-medium">Blog</th>
										<th className="px-5 py-2 text-right font-medium">Linked posts</th>
										<th className="px-5 py-2 text-right font-medium">Views (30d)</th>
										<th className="px-5 py-2 text-right font-medium">Views (all)</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-border">
									{data.blogger.publications.map((publication) => (
										<tr key={publication.slug}>
											<td className="px-5 py-2 font-medium text-foreground">{publication.name}</td>
											<td className="px-5 py-2">
												{publication.blogHost ? (
													<a href={`https://${publication.blogHost}`} target="_blank" rel="noopener" className="text-accent-foreground hover:underline">
														{publication.blogHost}
													</a>
												) : (
													<span className="text-muted-foreground">Not linked</span>
												)}
											</td>
											<td className="px-5 py-2 text-right tabular-nums text-muted-foreground">{publication.linkedPosts}</td>
											<td className="px-5 py-2 text-right tabular-nums text-muted-foreground">{publication.stats?.views30d?.toLocaleString() ?? '–'}</td>
											<td className="px-5 py-2 text-right tabular-nums text-muted-foreground">{publication.stats?.viewsAll?.toLocaleString() ?? '–'}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}

				</div>
			</Section>

			<Section id="neobook" title="Neobook integration">
				<div className={cardClass()}>
					<div className="border-b border-border px-5 py-4">
						<h3 className="text-sm font-semibold text-foreground">Neobook</h3>
						<p className="mt-0.5 text-xs text-muted-foreground">One-way sync that pulls the latest poem revisions and attachments from the Neobook profile.</p>
					</div>
					<div className="flex flex-col gap-4 px-5 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
						{data && (
							<div className="space-y-1">
								<p>
									Profile:{' '}
									<a href={data.neobook.profileUrl} target="_blank" rel="noopener" className="text-accent-foreground hover:underline">
										{data.neobook.profileUrl}
									</a>
								</p>
								<p className="text-xs">
									Public profile, no credentials required.{' '}
									<a href="/admin/books" className="text-accent-foreground hover:underline">
										{data.neobook.books} book{data.neobook.books === 1 ? '' : 's'} imported
									</a>
									.
								</p>
							</div>
						)}
						<button type="button" onClick={() => void syncNeobook()} disabled={syncing} className={`${buttonClass('accentOutline', 'sm')} shrink-0`}>
							{syncing ? 'Syncing…' : 'Sync'}
						</button>
					</div>
				</div>
			</Section>

			{importOpen && <ImportModal onClose={() => setImportOpen(false)} onContinue={(includeDrafts) => void runImport(includeDrafts)} />}
			{confirmDialog}
			<ToastStack>{toast && <Toast tone={toast.tone} message={toast.message} onDismiss={() => setToast(null)} />}</ToastStack>
		</div>
	);
}

function ImportModal({ onClose, onContinue }: { onClose: () => void; onContinue: (includeDrafts: boolean) => void }) {
	const [includeDrafts, setIncludeDrafts] = useState(false);

	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (event.key === 'Escape') onClose();
		}
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [onClose]);

	return (
		<div
			className={modalOverlayClass}
			role="dialog"
			aria-modal="true"
			aria-labelledby="blogger-import-title"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div className={modalPanelClass('w-full max-w-md p-5')}>
				<div className="mb-4 flex items-center justify-between">
					<h3 id="blogger-import-title" className="text-base font-semibold text-foreground">
						Import from Blogger
					</h3>
					<button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent">
						<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
							<path d="M18 6 6 18" />
							<path d="m6 6 12 12" />
						</svg>
					</button>
				</div>
				<p className="text-sm text-muted-foreground">New posts from the linked blogs are added to the CMS. Posts already imported are left untouched.</p>
				<label className="mt-4 flex items-center gap-2 text-sm text-foreground">
					<input type="checkbox" checked={includeDrafts} onChange={(event) => setIncludeDrafts(event.target.checked)} className="rounded border-border text-accent focus:ring-accent" />
					Include drafts
				</label>
				<div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-4">
					<button type="button" onClick={onClose} className={buttonClass('outline')}>
						Cancel
					</button>
					<button type="button" onClick={() => onContinue(includeDrafts)} className={buttonClass('primary')}>
						Continue
					</button>
				</div>
			</div>
		</div>
	);
}

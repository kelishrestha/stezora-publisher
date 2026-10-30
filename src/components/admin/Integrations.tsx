import { useEffect, useState } from 'react';
import { Section } from './Section';
import Toast, { ToastStack } from './Toast';
import { useConfirm } from './useConfirm';
import { badgeClass, buttonClass, cardClass } from '../ui/shared/classes';

interface BloggerPublication {
	slug: string;
	name: string;
	blogHost: string | null;
	linkedPosts: number;
}

interface IntegrationsData {
	blogger: { connected: boolean; publications: BloggerPublication[] };
	neobook: { profileUrl: string };
}

interface NeobookSyncResult {
	items: number;
	postsCreated: number;
	contentUpdates: number;
	imagesAttached: number;
	tagsCreated: number;
	unmatched: string[];
}

export default function Integrations() {
	const [data, setData] = useState<IntegrationsData | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [syncing, setSyncing] = useState(false);
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

	if (error) {
		return <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-foreground">{error}</p>;
	}

	return (
		<div className="max-w-2xl space-y-8">
			<Section id="blogger" title="Blogger integration">
				<div className={cardClass()}>
					<div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
						<div>
							<h3 className="text-sm font-semibold text-foreground">Blogger</h3>
							<p className="mt-0.5 text-xs text-muted-foreground">Posts are imported from Blogger into the CMS.</p>
						</div>
						{data && (
							<span className={data.blogger.connected ? badgeClass('success') : badgeClass('muted')}>
								{data.blogger.connected ? 'Connected' : 'Not configured'}
							</span>
						)}
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
							<p>
								Profile:{' '}
								<a href={data.neobook.profileUrl} target="_blank" rel="noopener" className="text-accent-foreground hover:underline">
									{data.neobook.profileUrl}
								</a>
							</p>
						)}
						<button type="button" onClick={() => void syncNeobook()} disabled={syncing} className={`${buttonClass('accentOutline', 'sm')} shrink-0`}>
							{syncing ? 'Syncing…' : 'Sync'}
						</button>
					</div>
				</div>
			</Section>

			{confirmDialog}
			<ToastStack>{toast && <Toast tone={toast.tone} message={toast.message} onDismiss={() => setToast(null)} />}</ToastStack>
		</div>
	);
}

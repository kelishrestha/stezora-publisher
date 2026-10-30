import { useEffect, useState } from 'react';
import { Section } from './Section';
import { badgeClass, cardClass } from '../ui/shared/classes';

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

export default function Integrations() {
	const [data, setData] = useState<IntegrationsData | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
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
				if (!cancelled && body) setData(body.data);
			})
			.catch((reason: unknown) => {
				if (!cancelled) setError(reason instanceof Error ? reason.message : 'Failed to load integrations.');
			});
		return () => {
			cancelled = true;
		};
	}, []);

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
					<div className="px-5 py-4 text-sm text-muted-foreground">
						{data && (
							<p>
								Profile:{' '}
								<a href={data.neobook.profileUrl} target="_blank" rel="noopener" className="text-accent-foreground hover:underline">
									{data.neobook.profileUrl}
								</a>
							</p>
						)}
					</div>
				</div>
			</Section>
		</div>
	);
}

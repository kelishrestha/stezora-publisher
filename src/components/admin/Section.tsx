import type { ReactNode } from 'react';

/** HyperUI-style left-aligned divider heading with its content below. */
export function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
	return (
		<section id={id} className="scroll-mt-20 space-y-3">
			<div className="flex items-center gap-4">
				<h2 className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
				<span className="h-px flex-1 bg-border" aria-hidden="true"></span>
			</div>
			{children}
		</section>
	);
}

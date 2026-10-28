import type { ReactNode } from 'react';

interface EmptyStateProps {
	icon: ReactNode;
	title: string;
	description: string;
	action?: ReactNode;
}

/** Centered empty state for admin tables and lists (HyperUI style, theme tokens). */
export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
	return (
		<div className="px-6 py-16 text-center">
			<span className="mx-auto grid size-12 place-content-center rounded-full bg-accent-soft text-accent-foreground">
				{icon}
			</span>
			<h3 className="mt-4 text-sm font-semibold text-foreground">{title}</h3>
			<p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
			{action && <div className="mt-5 flex justify-center">{action}</div>}
		</div>
	);
}

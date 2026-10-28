import { cardClass } from '../ui/shared/classes';

/** Pulsing placeholder block for skeleton layouts. */
export function SkeletonBlock({ className = '' }: { className?: string }) {
	return <div aria-hidden="true" className={`animate-pulse rounded bg-muted ${className}`} />;
}

/** Skeleton for row lists (posts, tags): thumb, two text lines, action pills. */
export function ListSkeleton({ rows = 6, withThumb = true }: { rows?: number; withThumb?: boolean }) {
	return (
		<div role="status" aria-label="Loading" className={cardClass()}>
			<ul className="divide-y divide-border">
				{Array.from({ length: rows }, (_, index) => (
					<li key={index} className="flex items-center gap-4 px-4 py-3">
						{withThumb && <SkeletonBlock className="size-12 shrink-0 rounded-md" />}
						<div className="min-w-0 flex-1 space-y-2">
							<SkeletonBlock className="h-4 w-1/2" />
							<SkeletonBlock className="h-3 w-1/3" />
						</div>
						<SkeletonBlock className="size-8 shrink-0 rounded-md" />
						<SkeletonBlock className="size-8 shrink-0 rounded-md" />
					</li>
				))}
			</ul>
		</div>
	);
}

/** Skeleton for card grids (media library). */
export function CardGridSkeleton({ cards = 6 }: { cards?: number }) {
	return (
		<ul role="status" aria-label="Loading" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{Array.from({ length: cards }, (_, index) => (
				<li key={index} className={cardClass()}>
					<SkeletonBlock className="h-40 w-full rounded-none" />
					<div className="space-y-2 p-4">
						<SkeletonBlock className="h-4 w-2/3" />
						<SkeletonBlock className="h-3 w-1/2" />
						<SkeletonBlock className="h-8 w-28 rounded-md" />
					</div>
				</li>
			))}
		</ul>
	);
}

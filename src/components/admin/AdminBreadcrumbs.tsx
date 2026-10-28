interface Crumb {
	name: string;
	href?: string;
}

/**
 * HyperUI breadcrumb pattern (chevron separators) for admin islands that only
 * know their trail client-side (post view/editor load the post title after
 * mount). Static admin pages use the Astro Breadcrumbs component instead.
 */
export default function AdminBreadcrumbs({ items }: { items: Crumb[] }) {
	return (
		<nav aria-label="Breadcrumb">
			<ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
				{items.map((item, index) => (
					<li key={`${item.name}-${index}`} className="flex items-center gap-1">
						{item.href ? (
							<a href={item.href} className="block transition-colors hover:text-accent-foreground">
								{item.name}
							</a>
						) : (
							<span aria-current={index === items.length - 1 ? 'page' : undefined} className="block text-foreground">
								{item.name}
							</span>
						)}
						{index < items.length - 1 && (
							<svg
								aria-hidden="true"
								xmlns="http://www.w3.org/2000/svg"
								className="size-4 rtl:rotate-180"
								viewBox="0 0 20 20"
								fill="currentColor"
							>
								<path
									fillRule="evenodd"
									d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
									clipRule="evenodd"
								/>
							</svg>
						)}
					</li>
				))}
			</ol>
		</nav>
	);
}

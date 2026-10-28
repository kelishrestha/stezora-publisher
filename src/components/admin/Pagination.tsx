import { paginationItemClass } from '../ui/shared/classes';
interface PaginationProps {
	totalItems: number;
	page: number;
	pageSize: number;
	onPageChange: (page: number) => void;
	onPageSizeChange: (size: number) => void;
	/** Plural noun for the range summary, e.g. "posts". */
	itemsLabel: string;
	/** Per-page choices offered in the selector. */
	sizeOptions?: number[];
}

/**
 * HyperUI pagination footer on theme tokens: range summary, per-page
 * selector, and prev/numbered/next controls (numbers hide when everything
 * fits one page).
 */
export default function Pagination({
	totalItems,
	page,
	pageSize,
	onPageChange,
	onPageSizeChange,
	itemsLabel,
	sizeOptions = [5, 10, 25, 50],
}: PaginationProps) {
	if (totalItems === 0) {
		return null;
	}

	const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
	const currentPage = Math.min(page, totalPages);

	return (
		<nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-4">
			<div className="flex flex-wrap items-center gap-4">
				<p className="text-xs text-muted-foreground">
					Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, totalItems)} of {totalItems}{' '}
					{itemsLabel}
				</p>
				<label className="flex items-center gap-2 text-xs text-muted-foreground">
					Show
					<select
						value={pageSize}
						onChange={(event) => onPageSizeChange(Number(event.target.value))}
						className="rounded border-border bg-background py-1 text-xs text-foreground shadow-sm focus:border-accent focus:ring-accent"
					>
						{sizeOptions.map((size) => (
							<option key={size} value={size}>
								{size}
							</option>
						))}
					</select>
					per page
				</label>
			</div>
			{totalPages > 1 && (
				<ul className="flex items-center gap-1">
					<li>
						<button
							type="button"
							onClick={() => onPageChange(Math.max(1, currentPage - 1))}
							disabled={currentPage === 1}
							aria-label="Previous page"
							className={`${paginationItemClass('page')} disabled:pointer-events-none disabled:opacity-50`}
						>
							<svg
								aria-hidden="true"
								xmlns="http://www.w3.org/2000/svg"
								className="size-4 rtl:rotate-180"
								viewBox="0 0 20 20"
								fill="currentColor"
							>
								<path
									fillRule="evenodd"
									d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
									clipRule="evenodd"
								/>
							</svg>
						</button>
					</li>
					{Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => (
						<li key={number}>
							<button
								type="button"
								onClick={() => onPageChange(number)}
								aria-current={number === currentPage ? 'page' : undefined}
								className={paginationItemClass(number === currentPage ? 'active' : 'page')}
							>
								{number}
							</button>
						</li>
					))}
					<li>
						<button
							type="button"
							onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
							disabled={currentPage === totalPages}
							aria-label="Next page"
							className={`${paginationItemClass('page')} disabled:pointer-events-none disabled:opacity-50`}
						>
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
						</button>
					</li>
				</ul>
			)}
		</nav>
	);
}

import { useMemo } from 'react';
import { BooksShowcase, type BookCfg } from '../vendor/books-showcase';
import CanvasGuard from './CanvasGuard';
import { buttonClass } from '../ui/shared/classes';

export interface ShelfBook {
	id: string;
	title: string;
	author: string;
	/** Publication year, shown next to the rating row. */
	year: string;
	/** Line under the description (genre, pages, price). */
	meta?: string;
	stars: number;
	desc: string;
	cover: string;
	href: string;
	cta: string;
}

const THEME_COLORS = {
	bgLight: '#ffffff',
	bgDark: '#1d1d1d',
	foregroundLight: '#171717',
	foregroundDark: '#fafafa',
};

interface Props {
	books: ShelfBook[];
}

/** Image-covered 3D shelf for published books, sharing the showcase island. */
export default function BookShelf({ books }: Props) {
	// The showcase rebuilds its 3D scene when `books` changes identity, so
	// the mapping must stay stable across re-renders (e.g. on selection).
	const cfgs: BookCfg[] = useMemo(() => books.map((book) => ({
		id: book.id,
		title: book.title,
		author: book.author,
		year: book.year,
		stars: book.stars,
		desc: book.desc,
		meta: book.meta,
		images: { front: book.cover },
	})), [books]);

	const fallback = (
		<ul className="grid gap-4 sm:grid-cols-2">
			{books.map((book) => (
				<li key={book.id} className="flex gap-4 rounded-md border border-border bg-surface p-5 shadow-sm">
					<img src={book.cover} alt="" loading="lazy" className="h-32 w-auto rounded border border-border object-cover" />
					<div className="min-w-0">
						<p className="font-serif text-lg font-semibold text-foreground">{book.title}</p>
						<p className="mt-1 text-xs text-muted-foreground">{book.meta ?? book.year}</p>
						<p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{book.desc}</p>
						<a href={book.href} className={`mt-3 ${buttonClass('accentOutline', 'sm')}`}>
							{book.cta}
							<span aria-hidden="true">&rarr;</span>
						</a>
					</div>
				</li>
			))}
		</ul>
	);

	return (
		<CanvasGuard fallback={fallback}>
		<div>
			<div className="relative h-[70vh] min-h-[480px] w-full overflow-hidden rounded-md">
				<BooksShowcase
					className="h-full min-h-0"
					books={cfgs}
					ctaLabel="Buy Now"
					onCtaClick={(cfg) => {
						const book = books.find((candidate) => candidate.id === cfg?.id);
						if (book) window.location.href = book.href;
					}}
					showSaveButton={false}
					showNav={false}
					showDetailPanel
					showCarousel={false}
					themeColors={THEME_COLORS}
				/>
			</div>
		</div>
		</CanvasGuard>
	);
}

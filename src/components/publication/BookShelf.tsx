import { useState } from 'react';
import { BooksShowcase, type BookCfg } from '../vendor/books-showcase';
import { buttonClass } from '../ui/shared/classes';

export interface ShelfBook {
	id: string;
	title: string;
	author: string;
	/** Imprint line under the title in the detail panel. */
	year: string;
	stars: number;
	desc: string;
	cover: string;
	href: string;
	cta: string;
}

interface Props {
	books: ShelfBook[];
	hint: string;
}

/** Image-covered 3D shelf for published books, sharing the showcase island. */
export default function BookShelf({ books, hint }: Props) {
	const [selected, setSelected] = useState<ShelfBook | null>(null);

	const cfgs: BookCfg[] = books.map((book) => ({
		id: book.id,
		title: book.title,
		author: book.author,
		year: book.year,
		stars: book.stars,
		desc: book.desc,
		images: { front: book.cover },
	}));

	return (
		<div>
			<div className="relative h-[70vh] min-h-[480px] w-full overflow-hidden rounded-md">
				<BooksShowcase
					className="h-full min-h-0"
					books={cfgs}
					showNav={false}
					showDetailPanel
					showCarousel={false}
					themeColors={{
						bgLight: '#ffffff',
						bgDark: '#1d1d1d',
						foregroundLight: '#171717',
						foregroundDark: '#fafafa',
					}}
					onBookSelect={(cfg) => setSelected(books.find((book) => book.id === cfg?.id) ?? null)}
				/>
			</div>
			<div className="mt-6 flex min-h-12 items-center justify-center">
				{selected ? (
					<a href={selected.href} className={buttonClass('primary')}>
						{selected.cta}
						<span aria-hidden="true">&rarr;</span>
					</a>
				) : (
					<p className="text-sm text-muted-foreground">{hint}</p>
				)}
			</div>
		</div>
	);
}

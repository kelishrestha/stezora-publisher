import { useEffect, useState } from 'react';
import { badgeClass, cardClass } from '../ui/shared/classes';

interface Book {
	id: string;
	source: string;
	title: string;
	blurb: string | null;
	category: string | null;
	language: string | null;
	price: string | null;
	cover_url: string | null;
	link_url: string | null;
	chapters: number | null;
	read_time: number | null;
	views: number | null;
	likes: number | null;
	comments: number | null;
	bookmarks: number | null;
	published_at: string | null;
}

function readingTime(seconds: number | null): string | null {
	if (!seconds || seconds <= 0) return null;
	const minutes = Math.round(seconds / 60);
	return `${minutes} min read`;
}

export default function Books() {
	const [books, setBooks] = useState<Book[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		fetch('/api/admin/books', { credentials: 'same-origin' })
			.then((response) => {
				if (response.status === 401) {
					window.location.href = '/admin/login';
					return null;
				}
				if (!response.ok) throw new Error(`Failed to load books (HTTP ${response.status}).`);
				return response.json() as Promise<{ data: { books: Book[] } }>;
			})
			.then((body) => {
				if (!cancelled && body) setBooks(body.data.books);
			})
			.catch((reason: unknown) => {
				if (!cancelled) setError(reason instanceof Error ? reason.message : 'Failed to load books.');
			});
		return () => {
			cancelled = true;
		};
	}, []);

	if (error) {
		return <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-foreground">{error}</p>;
	}

	if (!books) {
		return (
			<div className="space-y-4">
				{[0, 1].map((index) => (
					<div key={index} className="h-40 animate-pulse rounded-lg bg-surface-elevated" />
				))}
			</div>
		);
	}

	if (books.length === 0) {
		return <p className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-sm text-muted-foreground">No books imported yet. Run a Neobook sync from Settings to import them.</p>;
	}

	return (
		<div className="space-y-4">
			{books.map((book) => (
				<div key={book.id} className={`${cardClass()} flex flex-col gap-4 p-4 sm:flex-row`}>
					{book.cover_url ? (
						<img
							src={`/api/admin/remote-image?src=${encodeURIComponent(book.cover_url)}`}
							alt={`Cover of ${book.title}`}
							loading="lazy"
							className="h-48 w-32 shrink-0 self-center rounded-md border border-border object-cover sm:self-start"
						/>
					) : (
						<div className="grid h-48 w-32 shrink-0 place-content-center self-center rounded-md border border-border bg-surface-elevated text-xs text-muted-foreground sm:self-start">
							No cover
						</div>
					)}
					<div className="min-w-0 flex-1">
						<div className="flex flex-wrap items-center gap-2">
							<h2 className="text-lg font-semibold text-foreground">{book.title}</h2>
							{book.category && <span className={badgeClass('soft')}>{book.category}</span>}
						</div>
						<p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
							{book.language && <span>{book.language}</span>}
							{book.price && <span>{book.price}</span>}
							{readingTime(book.read_time) && <span>{readingTime(book.read_time)}</span>}
							{book.chapters !== null && <span>{book.chapters} chapters</span>}
						</p>
						{book.blurb && <p className="mt-3 text-sm text-muted-foreground">{book.blurb}</p>}
						<p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
							<span>{book.views ?? 0} views</span>
							<span>{book.likes ?? 0} likes</span>
							<span>{book.comments ?? 0} comments</span>
							<span>{book.bookmarks ?? 0} bookmarks</span>
						</p>
						{book.link_url && (
							<p className="mt-3 text-sm">
								<a href={book.link_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-accent-foreground hover:underline">
									View on Neobook
									<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
										<path d="M15 3h6v6" />
										<path d="M10 14 21 3" />
										<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
									</svg>
								</a>
							</p>
						)}
					</div>
				</div>
			))}
		</div>
	);
}

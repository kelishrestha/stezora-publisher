import { useMemo, useState } from 'react';
import { BooksShowcase, type BookCfg } from '../vendor/books-showcase';
import { buttonClass } from '../ui/shared/classes';
import { publicationPath } from '../../lib/publications';

export interface ShowcasePublication {
	name: string;
	slug: string;
	description: string;
	accent: string;
	postCount: number;
	postTitles: string[];
}

const THEME_COLORS = {
	bgLight: '#ffffff',
	bgDark: '#1d1d1d',
	foregroundLight: '#171717',
	foregroundDark: '#fafafa',
};

interface Props {
	publications: ShowcasePublication[];
}

/**
 * Book cover colors per publication palette. Hex approximations of the oklch
 * ramps (canvas painters need concrete colors that old engines also parse).
 */
const COVERS: Record<string, { spineBg: string; spineInk: string; backBg: string; backInk: string; edge: string }> = {
	'space-indigo': { spineBg: '#32375f', spineInk: '#eef0fa', backBg: '#262b4a', backInk: '#eef0fa', edge: '#e9e7dc' },
	'ocean-deep': { spineBg: '#1f4f78', spineInk: '#eaf2f9', backBg: '#173a59', backInk: '#eaf2f9', edge: '#e9e7dc' },
	'dark-amaranth': { spineBg: '#8c1f3f', spineInk: '#fdeef2', backBg: '#5f142b', backInk: '#fdeef2', edge: '#efe2d6' },
	'bright-amber': { spineBg: '#a87d1b', spineInk: '#fff8e3', backBg: '#7a5a12', backInk: '#fff8e3', edge: '#efe2d6' },
	'soft-periwinkle': { spineBg: '#31308f', spineInk: '#eceafc', backBg: '#242370', backInk: '#eceafc', edge: '#e9e7dc' },
};

export default function PublicationShowcase({ publications }: Props) {
	const [selected, setSelected] = useState<ShowcasePublication | null>(null);

	// The showcase rebuilds its 3D scene when `books` changes identity, so
	// the mapping must stay stable across re-renders (e.g. on selection).
	const books: BookCfg[] = useMemo(() => publications.map((publication) => ({
		id: publication.slug,
		title: publication.name,
		author: 'Stezora',
		year: `${publication.postCount} ${publication.postCount === 1 ? 'poem' : 'poems'}`,
		stars: 5,
		desc: publication.description,
		chapters: publication.postTitles,
		...(COVERS[publication.accent] ?? COVERS['space-indigo']),
	})), [publications]);

	return (
		<div>
			<div className="relative h-[70vh] min-h-[480px] w-full overflow-hidden rounded-md">
				<BooksShowcase
					className="h-full min-h-0"
					books={books}
					showNav={false}
					showDetailPanel
					showCarousel={false}
					themeColors={THEME_COLORS}
					onBookSelect={(book) =>
						setSelected(publications.find((publication) => publication.slug === book?.id) ?? null)
					}
				/>
			</div>
			<div className="mt-6 flex min-h-12 items-center justify-center">
				{selected ? (
					<a href={publicationPath(selected.slug)} className={buttonClass('primary')}>
						Read {selected.name}
						<span aria-hidden="true">&rarr;</span>
					</a>
				) : (
					<p className="text-sm text-muted-foreground">Pick a poem collection from the shelf to open its publication.</p>
				)}
			</div>
		</div>
	);
}

import { useMemo } from 'react';
import { BooksShowcase, type BookCfg } from '../vendor/books-showcase';
import { publicationPath } from '../../lib/publications';
import CanvasGuard from './CanvasGuard';
import { buttonClass } from '../ui/shared/classes';

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
	'space-indigo': { spineBg: '#3d44a0', spineInk: '#eef0fa', backBg: '#2e3379', backInk: '#eef0fa', edge: '#e9e7dc' },
	'ocean-deep': { spineBg: '#1d5a8c', spineInk: '#eaf2f9', backBg: '#153f63', backInk: '#eaf2f9', edge: '#e9e7dc' },
	'dark-amaranth': { spineBg: '#731631', spineInk: '#fdeef2', backBg: '#4d0f21', backInk: '#fdeef2', edge: '#efe2d6' },
	'bright-amber': { spineBg: '#9c7414', spineInk: '#fff8e3', backBg: '#6f520e', backInk: '#fff8e3', edge: '#efe2d6' },
	'soft-periwinkle': { spineBg: '#2c2b94', spineInk: '#eceafc', backBg: '#1f1f6e', backInk: '#eceafc', edge: '#e9e7dc' },
};

export default function PublicationShowcase({ publications }: Props) {
	// The showcase rebuilds its 3D scene when `books` changes identity, so
	// the mapping must stay stable across re-renders (e.g. on selection).
	const books: BookCfg[] = useMemo(() => publications.map((publication) => ({
		id: publication.slug,
		title: publication.name,
		author: 'Stezora',
		year: '',
		meta: `${publication.postCount} ${publication.postCount === 1 ? 'poem' : 'poems'}`,
		stars: 5,
		desc: publication.description,
		chapters: publication.postTitles,
		...(COVERS[publication.accent] ?? COVERS['space-indigo']),
	})), [publications]);

	const fallback = (
		<ul className="grid gap-4 sm:grid-cols-3">
			{publications.map((publication) => (
				<li key={publication.slug} className="rounded-md border border-border bg-surface p-5 shadow-sm">
					<p className="font-serif text-lg font-semibold text-foreground">{publication.name}</p>
					<p className="mt-1 text-sm text-muted-foreground">
						{publication.postCount} {publication.postCount === 1 ? 'poem' : 'poems'}
					</p>
					<p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{publication.description}</p>
					<a href={publicationPath(publication.slug)} className={`mt-4 ${buttonClass('accentOutline', 'sm')}`}>
						Read
						<span aria-hidden="true">&rarr;</span>
					</a>
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
					books={books}
					heroTitle="Poems"
					ctaLabel="Read"
					onCtaClick={(cfg) => {
						if (cfg) window.location.href = publicationPath(cfg.id);
					}}
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

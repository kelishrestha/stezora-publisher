import { useState } from 'react';

interface LoadingImageProps {
	src: string;
	alt: string;
	/** Sizing/border classes for the fixed-size wrapper. */
	wrapperClassName: string;
	/** Fit classes for the image itself (defaults to cover-fill). */
	imageClassName?: string;
}

/**
 * Image with a loading state: a pulsing skeleton and spinner hold the space
 * until the image arrives (Blogger CDN images can be slow), then the image
 * fades in. Failures fall back to a broken-image glyph instead of the
 * browser's default.
 */
export default function LoadingImage({
	src,
	alt,
	wrapperClassName,
	imageClassName = 'h-full w-full object-cover',
}: LoadingImageProps) {
	const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading');

	return (
		<span className={`relative block overflow-hidden ${wrapperClassName}`}>
			{state === 'loading' && (
				<span className="absolute inset-0 grid place-content-center bg-muted">
					{/* HyperUI dots pulse loader. */}
					<span className="flex gap-2" role="status" aria-label="Loading image">
						<span className="size-2.5 animate-pulse rounded-full bg-accent" aria-hidden="true" />
						<span className="size-2.5 animate-pulse rounded-full bg-accent [animation-delay:0.2s]" aria-hidden="true" />
						<span className="size-2.5 animate-pulse rounded-full bg-accent [animation-delay:0.4s]" aria-hidden="true" />
					</span>
				</span>
			)}
			{state === 'error' ? (
				<span className="absolute inset-0 grid place-content-center bg-muted text-muted-foreground">
					<svg
						aria-hidden="true"
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						className="size-5"
					>
						<path d="m2 2 20 20" />
						<path d="M10.41 10.41a2 2 0 1 1-2.83-2.83" />
						<path d="M13.5 13.5 6 21" />
						<path d="M18 12l3 3" />
						<path d="M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.052-.22 1.41-.59" />
						<path d="M21 15V5a2 2 0 0 0-2-2H9" />
					</svg>
					<span className="sr-only">Image failed to load</span>
				</span>
			) : (
				<img
					src={src}
					alt={alt}
					loading="lazy"
					onLoad={() => setState('loaded')}
					onError={() => setState('error')}
					className={`${imageClassName} transition-opacity duration-300 ${state === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
				/>
			)}
		</span>
	);
}

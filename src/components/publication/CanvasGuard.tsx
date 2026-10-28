import { Component, useEffect, useState, type ReactNode } from 'react';

/** True when the browser can create a WebGL context (three.js needs one). */
function webglAvailable(): boolean {
	try {
		const canvas = document.createElement('canvas');
		return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
	} catch {
		return false;
	}
}

interface BoundaryProps {
	fallback: ReactNode;
	children: ReactNode;
}

class ShowcaseErrorBoundary extends Component<BoundaryProps, { failed: boolean }> {
	state = { failed: false };

	static getDerivedStateFromError() {
		return { failed: true };
	}

	componentDidCatch(error: unknown) {
		console.error('Books showcase failed to render; falling back to the list.', error);
	}

	render() {
		return this.state.failed ? this.props.fallback : this.props.children;
	}
}

interface CanvasGuardProps {
	/** Rendered when WebGL is missing or the showcase crashes. */
	fallback: ReactNode;
	children: ReactNode;
}

/**
 * Guards the 3D showcase: waits for a client-side WebGL check before
 * mounting it, and catches render/setup crashes, showing the fallback in
 * both cases so the page never presents a dead canvas.
 */
export default function CanvasGuard({ fallback, children }: CanvasGuardProps) {
	const [supported, setSupported] = useState<boolean | null>(null);

	useEffect(() => {
		setSupported(webglAvailable());
	}, []);

	if (supported === null) {
		// SSR and the first client frame: a shelf-shaped skeleton with the
		// HyperUI dots pulse, so the page never shows a blank gap.
		return (
			<div
				role="status"
				aria-label="Loading bookshelf"
				className="grid h-[70vh] min-h-[480px] w-full animate-pulse place-content-center rounded-md bg-muted"
			>
				<span className="flex gap-2">
					<span className="size-3 animate-pulse rounded-full bg-accent" aria-hidden="true" />
					<span className="size-3 animate-pulse rounded-full bg-accent [animation-delay:0.2s]" aria-hidden="true" />
					<span className="size-3 animate-pulse rounded-full bg-accent [animation-delay:0.4s]" aria-hidden="true" />
				</span>
			</div>
		);
	}
	if (!supported) {
		return <>{fallback}</>;
	}
	return <ShowcaseErrorBoundary fallback={fallback}>{children}</ShowcaseErrorBoundary>;
}

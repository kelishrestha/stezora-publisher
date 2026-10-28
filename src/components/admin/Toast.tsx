import { useEffect, type ReactNode } from 'react';

interface ToastProps {
	message: string;
	tone: 'error' | 'success';
	onDismiss: () => void;
}

/** Bottom-right toast; auto-dismisses (errors linger longer) and can be closed. */
export default function Toast({ message, tone, onDismiss }: ToastProps) {
	useEffect(() => {
		const timer = setTimeout(onDismiss, tone === 'error' ? 8000 : 4000);
		return () => clearTimeout(timer);
	}, [message, tone, onDismiss]);

	const toneClass =
		tone === 'error'
			? 'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300'
			: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300';

	return (
		<div
			role={tone === 'error' ? 'alert' : 'status'}
			className={`pointer-events-auto flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${toneClass}`}
		>
			<span>{message}</span>
			<button type="button" onClick={onDismiss} aria-label="Dismiss" className="font-bold opacity-70 hover:opacity-100">
				&times;
			</button>
		</div>
	);
}

/** Fixed stacking container for toasts. */
export function ToastStack({ children }: { children: ReactNode }) {
	return <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">{children}</div>;
}

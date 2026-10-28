import { useEffect } from 'react';

interface ConfirmDialogProps {
	title: string;
	message: string;
	confirmLabel?: string;
	busy?: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}

/** Danger confirmation modal used by every destructive action. */
export default function ConfirmDialog({
	title,
	message,
	confirmLabel = 'Delete',
	busy = false,
	onConfirm,
	onCancel,
}: ConfirmDialogProps) {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onCancel();
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [onCancel]);

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm"
			role="dialog"
			aria-modal="true"
			onClick={onCancel}
		>
			<div
				className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-lg"
				onClick={(event) => event.stopPropagation()}
			>
				<h2 className="text-base font-semibold text-foreground">{title}</h2>
				<p className="mt-2 text-sm text-muted-foreground">{message}</p>
				<div className="mt-5 flex justify-end gap-2">
					<button
						type="button"
						onClick={onCancel}
						disabled={busy}
						className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-accent"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={onConfirm}
						disabled={busy}
						className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-red-50 transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{busy ? 'Working…' : confirmLabel}
					</button>
				</div>
			</div>
		</div>
	);
}

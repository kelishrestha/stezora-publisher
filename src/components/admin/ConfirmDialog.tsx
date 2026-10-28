import { useEffect } from 'react';
import { buttonClass } from '../ui/shared/classes';

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
						className={buttonClass('outline')}
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={onConfirm}
						disabled={busy}
						className={buttonClass('danger')}
					>
						{busy ? 'Working…' : confirmLabel}
					</button>
				</div>
			</div>
		</div>
	);
}

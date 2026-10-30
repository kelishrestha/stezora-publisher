import { useEffect } from 'react';
import { buttonClass } from '../ui/shared/classes';
import { modalOverlayClass, modalPanelClass } from '../ui/shared/classes';

interface ConfirmDialogProps {
	title: string;
	message: string;
	confirmLabel?: string;
	/** 'danger' (red, default) for destructive actions; 'primary' for ordinary ones. */
	tone?: 'danger' | 'primary';
	busy?: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}

/** Confirmation modal used before mutating actions. */
export default function ConfirmDialog({
	title,
	message,
	confirmLabel = 'Delete',
	tone = 'danger',
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
			className={modalOverlayClass}
			role="dialog"
			aria-modal="true"
			onClick={onCancel}
		>
			<div
				className={modalPanelClass()}
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
						className={buttonClass(tone === 'primary' ? 'primary' : 'danger')}
					>
						{busy ? 'Working…' : confirmLabel}
					</button>
				</div>
			</div>
		</div>
	);
}

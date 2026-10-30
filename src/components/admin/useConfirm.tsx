import { useCallback, useState, type ReactNode } from 'react';
import ConfirmDialog from './ConfirmDialog';

export interface ConfirmOptions {
	title: string;
	message: string;
	confirmLabel?: string;
	tone?: 'danger' | 'primary';
}

/**
 * Promise-based confirmation. Render `confirmDialog` once in the component tree,
 * then `await confirm({...})` before a mutating action; it resolves true when the
 * user confirms and false when they cancel.
 */
export function useConfirm(): { confirm: (options: ConfirmOptions) => Promise<boolean>; confirmDialog: ReactNode } {
	const [pending, setPending] = useState<{ options: ConfirmOptions; resolve: (ok: boolean) => void } | null>(null);

	const confirm = useCallback(
		(options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ options, resolve })),
		[]
	);

	const settle = useCallback((ok: boolean) => {
		setPending((current) => {
			current?.resolve(ok);
			return null;
		});
	}, []);

	const confirmDialog = pending ? (
		<ConfirmDialog
			title={pending.options.title}
			message={pending.options.message}
			confirmLabel={pending.options.confirmLabel ?? 'Confirm'}
			tone={pending.options.tone ?? 'primary'}
			onConfirm={() => settle(true)}
			onCancel={() => settle(false)}
		/>
	) : null;

	return { confirm, confirmDialog };
}

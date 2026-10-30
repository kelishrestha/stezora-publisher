import { useState } from 'react';
import { createAuthClient } from 'better-auth/client';
import { buttonClass, cardClass, formControlClass } from '../ui/shared/classes';

/**
 * Admin settings. The Security section lets the owner rotate the account
 * password (closing the gap where the password could only be set by re-seeding).
 * Two-factor and analytics/privacy settings are planned follow-ups (PLAN.md M8).
 */

const authClient = createAuthClient();
const MIN_LENGTH = 8;

export default function Settings() {
	const [current, setCurrent] = useState('');
	const [next, setNext] = useState('');
	const [confirm, setConfirm] = useState('');
	const [revokeOthers, setRevokeOthers] = useState(true);
	const [show, setShow] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [status, setStatus] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setStatus(null);

		if (next.length < MIN_LENGTH) {
			setStatus({ type: 'error', message: `New password must be at least ${MIN_LENGTH} characters.` });
			return;
		}
		if (next !== confirm) {
			setStatus({ type: 'error', message: 'New password and confirmation do not match.' });
			return;
		}
		if (next === current) {
			setStatus({ type: 'error', message: 'New password must differ from the current one.' });
			return;
		}

		setSubmitting(true);
		const { error } = await authClient.changePassword({
			currentPassword: current,
			newPassword: next,
			revokeOtherSessions: revokeOthers,
		});
		setSubmitting(false);

		if (error) {
			setStatus({ type: 'error', message: error.message || 'Could not change the password. Check your current password.' });
			return;
		}
		setStatus({ type: 'success', message: 'Password changed.' });
		setCurrent('');
		setNext('');
		setConfirm('');
	}

	const inputType = show ? 'text' : 'password';

	return (
		<div className="max-w-xl space-y-6">
			<section className={cardClass()}>
				<div className="border-b border-border px-5 py-4">
					<h2 className="text-base font-semibold text-foreground">Change password</h2>
					<p className="mt-0.5 text-xs text-muted-foreground">Update your admin account password.</p>
				</div>
				<form onSubmit={handleSubmit} className="space-y-4 p-5">
					<div>
						<label htmlFor="current-password" className="block text-sm font-medium text-foreground">
							Current password
						</label>
						<input
							id="current-password"
							type={inputType}
							autoComplete="current-password"
							required
							value={current}
							onChange={(event) => setCurrent(event.target.value)}
							className={formControlClass}
						/>
					</div>
					<div>
						<label htmlFor="new-password" className="block text-sm font-medium text-foreground">
							New password
						</label>
						<input
							id="new-password"
							type={inputType}
							autoComplete="new-password"
							required
							minLength={MIN_LENGTH}
							value={next}
							onChange={(event) => setNext(event.target.value)}
							className={formControlClass}
						/>
						<p className="mt-1 text-xs text-muted-foreground">At least {MIN_LENGTH} characters.</p>
					</div>
					<div>
						<label htmlFor="confirm-password" className="block text-sm font-medium text-foreground">
							Confirm new password
						</label>
						<input
							id="confirm-password"
							type={inputType}
							autoComplete="new-password"
							required
							value={confirm}
							onChange={(event) => setConfirm(event.target.value)}
							className={formControlClass}
						/>
					</div>

					<label className="flex items-center gap-2 text-sm text-muted-foreground">
						<input type="checkbox" checked={show} onChange={(event) => setShow(event.target.checked)} className="rounded border-border text-accent focus:ring-accent" />
						Show passwords
					</label>

					{status && (
						<div
							className={
								status.type === 'error'
									? 'rounded-md bg-accent-soft px-3 py-2 text-sm text-accent-foreground'
									: 'rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
							}
							role="alert"
						>
							{status.message}
						</div>
					)}

					<div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
						<label className="flex items-center gap-2 text-sm text-muted-foreground">
							<input type="checkbox" checked={revokeOthers} onChange={(event) => setRevokeOthers(event.target.checked)} className="rounded border-border text-accent focus:ring-accent" />
							Sign out other devices
						</label>
						<button type="submit" disabled={submitting} className={buttonClass('primary')}>
							{submitting ? 'Saving…' : 'Update password'}
						</button>
					</div>
				</form>
			</section>
		</div>
	);
}

import { useEffect, useState } from 'react';
import { createAuthClient } from 'better-auth/client';
import { buttonClass, cardClass, formControlClass } from '../ui/shared/classes';
import { filterSelectClass } from './filters';

/**
 * Admin settings. Security (change password) and Analytics & privacy (tracking
 * toggle, consent mode, retention, and clearing data). Two-factor is a planned
 * follow-up (PLAN.md M8.1).
 */

const authClient = createAuthClient();
const MIN_LENGTH = 8;

type Status = { type: 'error' | 'success'; message: string } | null;

function StatusNote({ status }: { status: Status }) {
	if (!status) return null;
	return (
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
	);
}

const passwordInputClass =
	'w-full rounded border-border bg-background pr-10 text-foreground shadow-sm sm:text-sm placeholder:text-muted-foreground focus:border-accent focus:ring-accent';

function PasswordField({
	id,
	label,
	value,
	autoComplete,
	hint,
	onChange,
}: {
	id: string;
	label: string;
	value: string;
	autoComplete: string;
	hint?: string;
	onChange: (value: string) => void;
}) {
	const [show, setShow] = useState(false);
	return (
		<div>
			<label htmlFor={id} className="block text-sm font-medium text-foreground">
				{label}
			</label>
			<div className="relative mt-0.5">
				<input
					id={id}
					type={show ? 'text' : 'password'}
					autoComplete={autoComplete}
					required
					value={value}
					onChange={(event) => onChange(event.target.value)}
					className={passwordInputClass}
				/>
				<button
					type="button"
					onClick={() => setShow((value) => !value)}
					aria-label={show ? 'Hide password' : 'Show password'}
					aria-pressed={show}
					className="absolute inset-y-0 right-0 flex items-center rounded px-3 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
				>
					{show ? <EyeOffIcon /> : <EyeIcon />}
				</button>
			</div>
			{hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
		</div>
	);
}

function ChangePasswordCard() {
	const [current, setCurrent] = useState('');
	const [next, setNext] = useState('');
	const [confirm, setConfirm] = useState('');
	const [revokeOthers, setRevokeOthers] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [status, setStatus] = useState<Status>(null);

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
		const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: revokeOthers });
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

	return (
		<section className={cardClass()}>
			<div className="border-b border-border px-5 py-4">
				<h2 className="text-base font-semibold text-foreground">Change password</h2>
				<p className="mt-0.5 text-xs text-muted-foreground">Update your admin account password.</p>
			</div>
			<form onSubmit={handleSubmit} className="space-y-4 p-5">
				<PasswordField id="current-password" label="Current password" autoComplete="current-password" value={current} onChange={setCurrent} />
				<PasswordField
					id="new-password"
					label="New password"
					autoComplete="new-password"
					value={next}
					onChange={setNext}
					hint={`At least ${MIN_LENGTH} characters.`}
				/>
				<PasswordField id="confirm-password" label="Confirm new password" autoComplete="new-password" value={confirm} onChange={setConfirm} />

				<StatusNote status={status} />

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
	);
}

interface AppSettings {
	analyticsEnabled: boolean;
	consentMode: 'opt-out' | 'opt-in';
	retentionDays: number;
}

function AnalyticsPrivacyCard() {
	const [settings, setSettings] = useState<AppSettings | null>(null);
	const [saving, setSaving] = useState(false);
	const [clearing, setClearing] = useState(false);
	const [status, setStatus] = useState<Status>(null);

	useEffect(() => {
		let cancelled = false;
		fetch('/api/admin/settings', { credentials: 'same-origin' })
			.then((response) => (response.ok ? (response.json() as Promise<{ data: { settings: AppSettings } }>) : null))
			.then((body) => {
				if (!cancelled && body) setSettings(body.data.settings);
			})
			.catch(() => undefined);
		return () => {
			cancelled = true;
		};
	}, []);

	function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
		setSettings((current) => (current ? { ...current, [key]: value } : current));
	}

	async function save() {
		if (!settings) return;
		setStatus(null);
		setSaving(true);
		const response = await fetch('/api/admin/settings', {
			method: 'PUT',
			credentials: 'same-origin',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(settings),
		});
		setSaving(false);
		if (!response.ok) {
			setStatus({ type: 'error', message: 'Could not save settings.' });
			return;
		}
		const body = (await response.json()) as { data: { settings: AppSettings } };
		setSettings(body.data.settings);
		setStatus({ type: 'success', message: 'Settings saved.' });
	}

	async function clear(scope: 'old' | 'all') {
		if (scope === 'all' && !window.confirm('Delete all recorded pageview data? This cannot be undone.')) return;
		setStatus(null);
		setClearing(true);
		const response = await fetch('/api/admin/analytics/clear', {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ scope }),
		});
		setClearing(false);
		setStatus(
			response.ok
				? { type: 'success', message: scope === 'all' ? 'All analytics data cleared.' : 'Old analytics data cleared.' }
				: { type: 'error', message: 'Could not clear data.' }
		);
	}

	return (
		<section className={cardClass()}>
			<div className="border-b border-border px-5 py-4">
				<h2 className="text-base font-semibold text-foreground">Analytics &amp; privacy</h2>
				<p className="mt-0.5 text-xs text-muted-foreground">First-party visitor analytics collected from your own site.</p>
			</div>
			<div className="space-y-5 p-5">
				{!settings ? (
					<div className="h-32 animate-pulse rounded-md bg-surface-elevated" />
				) : (
					<>
						<label className="flex items-start justify-between gap-4">
							<span>
								<span className="block text-sm font-medium text-foreground">Collect analytics</span>
								<span className="mt-0.5 block text-xs text-muted-foreground">When off, no pageviews are recorded.</span>
							</span>
							<input
								type="checkbox"
								checked={settings.analyticsEnabled}
								onChange={(event) => update('analyticsEnabled', event.target.checked)}
								className="mt-1 size-4 rounded border-border text-accent focus:ring-accent"
							/>
						</label>

						<label htmlFor="consent-mode" className="block">
							<span className="block text-sm font-medium text-foreground">Cookie consent mode</span>
							<span className="mt-0.5 block text-xs text-muted-foreground">
								Opt-out sets the returning-visitor cookie by default; opt-in waits for acceptance.
							</span>
							<select
								id="consent-mode"
								value={settings.consentMode}
								onChange={(event) => update('consentMode', event.target.value as AppSettings['consentMode'])}
								className={`${filterSelectClass} max-w-xs`}
							>
								<option value="opt-out">Opt-out (cookie on by default)</option>
								<option value="opt-in">Opt-in (cookie after accept)</option>
							</select>
						</label>

						<label htmlFor="retention" className="block">
							<span className="block text-sm font-medium text-foreground">Data retention (days)</span>
							<span className="mt-0.5 block text-xs text-muted-foreground">Used by the "delete old data" action below.</span>
							<input
								id="retention"
								type="number"
								min={1}
								max={3650}
								value={settings.retentionDays}
								onChange={(event) => update('retentionDays', Math.max(1, Math.min(3650, Number(event.target.value) || 1)))}
								className={`${formControlClass} max-w-[8rem]`}
							/>
						</label>

						<StatusNote status={status} />

						<div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
							<button type="button" onClick={save} disabled={saving} className={buttonClass('primary')}>
								{saving ? 'Saving…' : 'Save settings'}
							</button>
							<button type="button" onClick={() => clear('old')} disabled={clearing} className={buttonClass('outline')}>
								Delete data older than {settings.retentionDays} days
							</button>
							<button type="button" onClick={() => clear('all')} disabled={clearing} className={buttonClass('dangerOutline')}>
								Clear all data
							</button>
						</div>
					</>
				)}
			</div>
		</section>
	);
}

export default function Settings() {
	return (
		<div className="max-w-xl space-y-6">
			<ChangePasswordCard />
			<AnalyticsPrivacyCard />
		</div>
	);
}

function EyeIcon() {
	return (
		<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
			<circle cx="12" cy="12" r="3" />
		</svg>
	);
}

function EyeOffIcon() {
	return (
		<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			<path d="M9.88 9.88a3 3 0 0 0 4.24 4.24" />
			<path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
			<path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
			<line x1="2" x2="22" y1="2" y2="22" />
		</svg>
	);
}

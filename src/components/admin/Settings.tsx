import { useEffect, useState } from 'react';
import { createAuthClient } from 'better-auth/client';
import { buttonClass, cardClass, formControlClass, modalOverlayClass, modalPanelClass } from '../ui/shared/classes';
import { filterSelectClass } from './filters';
import { useConfirm } from './useConfirm';

/**
 * Admin settings, grouped into labelled sections (Account, Analytics & privacy,
 * Danger zone). Simple settings use a row pattern (label + description on the
 * left, control on the right); destructive actions live in the danger zone.
 * Two-factor is a planned follow-up (PLAN.md M8.1).
 */

const authClient = createAuthClient();
const MIN_LENGTH = 8;

type Status = { type: 'error' | 'success'; message: string } | null;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="space-y-3">
			<div className="flex items-center gap-4">
				<h2 className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
				<span className="h-px flex-1 bg-border" aria-hidden="true"></span>
			</div>
			{children}
		</section>
	);
}

function SettingRow({
	labelId,
	title,
	description,
	control,
}: {
	labelId?: string;
	title: string;
	description?: string;
	control: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
			<div className="min-w-0 sm:flex-1">
				<p id={labelId} className="text-sm font-medium text-foreground">
					{title}
				</p>
				{description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
			</div>
			<div className="shrink-0">{control}</div>
		</div>
	);
}

/** HyperUI-style toggle: a peer checkbox with a sliding knob, on theme tokens. */
function Switch({ checked, onChange, labelledBy }: { checked: boolean; onChange: (value: boolean) => void; labelledBy?: string }) {
	return (
		<label className="relative inline-block h-6 w-11 shrink-0 cursor-pointer">
			<input
				type="checkbox"
				className="peer sr-only"
				checked={checked}
				aria-labelledby={labelledBy}
				onChange={(event) => onChange(event.target.checked)}
			/>
			<span className="absolute inset-0 rounded-full bg-muted transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface"></span>
			<span className="absolute inset-y-0 start-0 m-0.5 size-5 rounded-full bg-surface shadow transition-all peer-checked:start-5"></span>
		</label>
	);
}

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

function ChangePassword() {
	const [open, setOpen] = useState(false);
	return (
		<div className={cardClass()}>
			<SettingRow
				title="Password"
				description="Change your admin account password."
				control={
					<button type="button" onClick={() => setOpen(true)} className={buttonClass('outline')}>
						Change password
					</button>
				}
			/>
			{open && <ChangePasswordModal onClose={() => setOpen(false)} />}
		</div>
	);
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
	const [current, setCurrent] = useState('');
	const [next, setNext] = useState('');
	const [confirm, setConfirm] = useState('');
	const [revokeOthers, setRevokeOthers] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [status, setStatus] = useState<Status>(null);

	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (event.key === 'Escape') onClose();
		}
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [onClose]);

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
		<div
			className={modalOverlayClass}
			role="dialog"
			aria-modal="true"
			aria-labelledby="change-pw-title"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div className={modalPanelClass('w-full max-w-md max-h-[90vh] overflow-y-auto p-5')}>
				<div className="mb-4 flex items-center justify-between">
					<h3 id="change-pw-title" className="text-base font-semibold text-foreground">
						Change password
					</h3>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close"
						className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
							<path d="M18 6 6 18" />
							<path d="m6 6 12 12" />
						</svg>
					</button>
				</div>
				<form onSubmit={handleSubmit} className="space-y-4">
					<PasswordField id="current-password" label="Current password" autoComplete="current-password" value={current} onChange={setCurrent} />
					<PasswordField id="new-password" label="New password" autoComplete="new-password" value={next} onChange={setNext} hint={`At least ${MIN_LENGTH} characters.`} />
					<PasswordField id="confirm-password" label="Confirm new password" autoComplete="new-password" value={confirm} onChange={setConfirm} />
					<label className="flex items-center gap-2 text-sm text-muted-foreground">
						<input type="checkbox" checked={revokeOthers} onChange={(event) => setRevokeOthers(event.target.checked)} className="rounded border-border text-accent focus:ring-accent" />
						Sign out other devices
					</label>
					<StatusNote status={status} />
					<div className="flex items-center justify-end gap-2 border-t border-border pt-4">
						<button type="button" onClick={onClose} className={buttonClass('outline')}>
							Cancel
						</button>
						<button type="submit" disabled={submitting} className={buttonClass('primary')}>
							{submitting ? 'Saving…' : 'Update password'}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}

interface AppSettings {
	analyticsEnabled: boolean;
	consentMode: 'opt-out' | 'opt-in';
	retentionDays: number;
}

function AnalyticsPrivacy() {
	const [settings, setSettings] = useState<AppSettings | null>(null);
	const [saving, setSaving] = useState(false);
	const [deleteScope, setDeleteScope] = useState<'old' | 'all' | null>(null);
	const [status, setStatus] = useState<Status>(null);
	const { confirm, confirmDialog } = useConfirm();

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
		if (!(await confirm({ title: 'Save settings?', message: 'Apply these analytics and privacy settings?', confirmLabel: 'Save', tone: 'primary' }))) return;
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

	async function clear(scope: 'old' | 'all'): Promise<boolean> {
		const response = await fetch('/api/admin/analytics/clear', {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ scope }),
		});
		return response.ok;
	}

	const retention = settings?.retentionDays ?? 90;

	return (
		<>
			{confirmDialog}
			<Section title="Analytics & privacy">
				<div className={cardClass()}>
					{!settings ? (
						<div className="m-5 h-40 animate-pulse rounded-md bg-surface-elevated" />
					) : (
						<>
							<div className="divide-y divide-border">
								<SettingRow
									labelId="row-collect"
									title="Collect analytics"
									description="First-party visitor analytics. When off, no pageviews are recorded."
									control={<Switch checked={settings.analyticsEnabled} onChange={(value) => update('analyticsEnabled', value)} labelledBy="row-collect" />}
								/>
								<SettingRow
									labelId="row-consent"
									title="Cookie consent mode"
									description="Opt-out sets the returning-visitor cookie by default; opt-in waits for acceptance."
									control={
										<select
											aria-labelledby="row-consent"
											value={settings.consentMode}
											onChange={(event) => update('consentMode', event.target.value as AppSettings['consentMode'])}
											className={`${filterSelectClass} w-48`}
										>
											<option value="opt-out">Opt-out (default on)</option>
											<option value="opt-in">Opt-in (after accept)</option>
										</select>
									}
								/>
								<SettingRow
									labelId="row-retention"
									title="Data retention"
									description="Days of raw pageview data to keep; used by the cleanup below."
									control={
										<input
											aria-labelledby="row-retention"
											type="number"
											min={1}
											max={3650}
											value={settings.retentionDays}
											onChange={(event) => update('retentionDays', Math.max(1, Math.min(3650, Number(event.target.value) || 1)))}
											className={`${formControlClass} w-24`}
										/>
									}
								/>
							</div>
							<div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
								<StatusNote status={status} />
								<button type="button" onClick={save} disabled={saving} className={`${buttonClass('primary')} ml-auto`}>
									{saving ? 'Saving…' : 'Save settings'}
								</button>
							</div>
						</>
					)}
				</div>
			</Section>

			<Section title="Danger zone">
				<div className="overflow-hidden rounded-md border border-red-300 bg-red-50/50 shadow-sm dark:border-red-900 dark:bg-red-950/30">
					<div className="divide-y divide-red-200 dark:divide-red-900">
						<SettingRow
							title="Delete old data"
							description={`Remove pageviews older than the retention window (${retention} days).`}
							control={
								<button type="button" onClick={() => setDeleteScope('old')} disabled={!settings} className={buttonClass('dangerOutline')}>
									Delete old
								</button>
							}
						/>
						<SettingRow
							title="Clear all analytics data"
							description="Permanently delete every recorded pageview. This cannot be undone."
							control={
								<button type="button" onClick={() => setDeleteScope('all')} disabled={!settings} className={buttonClass('danger')}>
									Clear all
								</button>
							}
						/>
					</div>
				</div>
			</Section>

			{deleteScope && (
				<DeleteDataModal scope={deleteScope} retention={retention} onClose={() => setDeleteScope(null)} onConfirm={() => clear(deleteScope)} />
			)}
		</>
	);
}

function DeleteDataModal({
	scope,
	retention,
	onClose,
	onConfirm,
}: {
	scope: 'old' | 'all';
	retention: number;
	onClose: () => void;
	onConfirm: () => Promise<boolean>;
}) {
	const [busy, setBusy] = useState(false);
	const [downloading, setDownloading] = useState(false);
	const [done, setDone] = useState(false);
	const [status, setStatus] = useState<Status>(null);
	const isAll = scope === 'all';

	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (event.key === 'Escape') onClose();
		}
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [onClose]);

	async function backup() {
		setStatus(null);
		setDownloading(true);
		try {
			const response = await fetch('/api/admin/analytics/export', { credentials: 'same-origin' });
			if (!response.ok) throw new Error('export failed');
			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `stezora-analytics-${new Date().toISOString().slice(0, 10)}.json`;
			document.body.appendChild(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(url);
			setStatus({ type: 'success', message: 'Backup downloaded.' });
		} catch {
			setStatus({ type: 'error', message: 'Could not download backup.' });
		} finally {
			setDownloading(false);
		}
	}

	async function confirm() {
		setBusy(true);
		const okResult = await onConfirm();
		setBusy(false);
		if (okResult) {
			setDone(true);
			setStatus({ type: 'success', message: isAll ? 'All analytics data cleared.' : 'Old analytics data cleared.' });
		} else {
			setStatus({ type: 'error', message: 'Could not clear data.' });
		}
	}

	return (
		<div
			className={modalOverlayClass}
			role="dialog"
			aria-modal="true"
			aria-labelledby="delete-data-title"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div className={modalPanelClass('w-full max-w-md max-h-[90vh] overflow-y-auto p-5')}>
				<h3 id="delete-data-title" className="text-base font-semibold text-foreground">
					{isAll ? 'Clear all analytics data' : 'Delete old analytics data'}
				</h3>
				<p className="mt-2 text-sm text-muted-foreground">
					{isAll ? 'This permanently deletes every recorded pageview.' : `This removes pageviews older than ${retention} days.`} This cannot be undone. Download a
					backup first if you want to keep a copy.
				</p>

				{status && (
					<div className="mt-4">
						<StatusNote status={status} />
					</div>
				)}

				<div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
					<button type="button" onClick={backup} disabled={downloading} className={buttonClass('outline')}>
						{downloading ? 'Preparing…' : 'Download backup'}
					</button>
					<div className="flex gap-2">
						<button type="button" onClick={onClose} className={buttonClass('outline')}>
							{done ? 'Close' : 'Cancel'}
						</button>
						{!done && (
							<button type="button" onClick={confirm} disabled={busy} className={buttonClass(isAll ? 'danger' : 'dangerOutline')}>
								{busy ? 'Deleting…' : isAll ? 'Clear all' : 'Delete'}
							</button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

function DataExport() {
	const [downloading, setDownloading] = useState(false);
	const [status, setStatus] = useState<Status>(null);

	async function download() {
		setStatus(null);
		setDownloading(true);
		try {
			const response = await fetch('/api/export', { credentials: 'same-origin' });
			if (response.status === 401) {
				window.location.href = '/admin/login';
				return;
			}
			if (!response.ok) throw new Error('export failed');
			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `stezora-export-${new Date().toISOString().slice(0, 10)}.json`;
			document.body.appendChild(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(url);
			setStatus({ type: 'success', message: 'Download started.' });
		} catch {
			setStatus({ type: 'error', message: 'Could not download data.' });
		} finally {
			setDownloading(false);
		}
	}

	return (
		<Section title="Data">
			<div className={cardClass()}>
				<SettingRow
					title="Download all data"
					description="Export all content (publications, posts, tags, and media references) as a JSON file. Account credentials are not included."
					control={
						<button type="button" onClick={download} disabled={downloading} className={buttonClass('outline')}>
							{downloading ? 'Preparing…' : 'Download'}
						</button>
					}
				/>
				{status && (
					<div className="border-t border-border px-5 py-4">
						<StatusNote status={status} />
					</div>
				)}
			</div>
		</Section>
	);
}

export default function Settings() {
	return (
		<div className="max-w-2xl space-y-8">
			<Section title="Account">
				<ChangePassword />
			</Section>
			<DataExport />
			<AnalyticsPrivacy />
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

import { appSettings } from '../db/schema';
import type { Db } from '../db/client';

/**
 * Application settings persisted in the `app_settings` key/value table, read
 * with sensible defaults when a key is missing.
 */
export interface AppSettings {
	analyticsEnabled: boolean;
	/** opt-out: cookie on unless declined. opt-in: cookie only after explicit consent. */
	consentMode: 'opt-out' | 'opt-in';
	retentionDays: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
	analyticsEnabled: true,
	consentMode: 'opt-out',
	retentionDays: 90,
};

const KEYS = {
	analyticsEnabled: 'analytics_enabled',
	consentMode: 'consent_mode',
	retentionDays: 'retention_days',
} as const;

function clampDays(value: number): number {
	if (!Number.isFinite(value)) return DEFAULT_SETTINGS.retentionDays;
	return Math.min(Math.max(Math.trunc(value), 1), 3650);
}

export async function readAppSettings(db: Db): Promise<AppSettings> {
	const rows = await db.select().from(appSettings);
	const map = new Map(rows.map((row) => [row.key, row.value]));
	return {
		analyticsEnabled: map.has(KEYS.analyticsEnabled) ? map.get(KEYS.analyticsEnabled) === 'true' : DEFAULT_SETTINGS.analyticsEnabled,
		consentMode: map.get(KEYS.consentMode) === 'opt-in' ? 'opt-in' : DEFAULT_SETTINGS.consentMode,
		retentionDays: map.has(KEYS.retentionDays) ? clampDays(Number(map.get(KEYS.retentionDays))) : DEFAULT_SETTINGS.retentionDays,
	};
}

export async function writeAppSettings(db: Db, patch: Partial<AppSettings>): Promise<void> {
	const entries: Array<{ key: string; value: string }> = [];
	if (patch.analyticsEnabled !== undefined) entries.push({ key: KEYS.analyticsEnabled, value: String(patch.analyticsEnabled) });
	if (patch.consentMode !== undefined) entries.push({ key: KEYS.consentMode, value: patch.consentMode });
	if (patch.retentionDays !== undefined) entries.push({ key: KEYS.retentionDays, value: String(clampDays(patch.retentionDays)) });
	for (const entry of entries) {
		await db.insert(appSettings).values(entry).onConflictDoUpdate({ target: appSettings.key, set: { value: entry.value } });
	}
}

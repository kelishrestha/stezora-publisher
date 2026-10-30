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
	/** IANA timezone the admin UI displays dates and times in. */
	timezone: string;
	/**
	 * Serve media bytes from R2 (/media/<key>). When off, media falls back to its
	 * external source URL. Also requires the MEDIA binding and the
	 * ENABLE_MEDIA_STORAGE env gate; this setting can only turn serving off.
	 */
	mediaStorageEnabled: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
	analyticsEnabled: true,
	consentMode: 'opt-out',
	retentionDays: 90,
	// Nepal time (UTC+5:45) by default.
	timezone: 'Asia/Kathmandu',
	mediaStorageEnabled: true,
};

const KEYS = {
	analyticsEnabled: 'analytics_enabled',
	consentMode: 'consent_mode',
	retentionDays: 'retention_days',
	timezone: 'timezone',
	mediaStorageEnabled: 'media_storage_enabled',
} as const;

/** True when `value` is an IANA timezone the runtime understands. */
export function isValidTimeZone(value: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: value });
		return true;
	} catch {
		return false;
	}
}

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
		timezone: map.get(KEYS.timezone) && isValidTimeZone(map.get(KEYS.timezone) as string) ? (map.get(KEYS.timezone) as string) : DEFAULT_SETTINGS.timezone,
		mediaStorageEnabled: map.has(KEYS.mediaStorageEnabled) ? map.get(KEYS.mediaStorageEnabled) === 'true' : DEFAULT_SETTINGS.mediaStorageEnabled,
	};
}

export async function writeAppSettings(db: Db, patch: Partial<AppSettings>): Promise<void> {
	const entries: Array<{ key: string; value: string }> = [];
	if (patch.analyticsEnabled !== undefined) entries.push({ key: KEYS.analyticsEnabled, value: String(patch.analyticsEnabled) });
	if (patch.consentMode !== undefined) entries.push({ key: KEYS.consentMode, value: patch.consentMode });
	if (patch.retentionDays !== undefined) entries.push({ key: KEYS.retentionDays, value: String(clampDays(patch.retentionDays)) });
	if (patch.timezone !== undefined && isValidTimeZone(patch.timezone)) entries.push({ key: KEYS.timezone, value: patch.timezone });
	if (patch.mediaStorageEnabled !== undefined) entries.push({ key: KEYS.mediaStorageEnabled, value: String(patch.mediaStorageEnabled) });
	for (const entry of entries) {
		await db.insert(appSettings).values(entry).onConflictDoUpdate({ target: appSettings.key, set: { value: entry.value } });
	}
}

-- One-time reconciliation after the migration history was squashed and
-- renamed (2026-10-28). The old migrations were replaced by one migration
-- per table (0000_publications.sql through 0010_rate_limit.sql). The
-- resulting schema is identical, so databases that already applied an old
-- history must only have their d1_migrations bookkeeping rewritten.
-- Run ONLY against a database that had the full old history applied:
--   wrangler d1 execute stezora-publisher-db --local  --file scripts/db/reconcile-migration-rename.sql
--   wrangler d1 execute stezora-publisher-db --remote --file scripts/db/reconcile-migration-rename.sql
-- Fresh databases must NOT run this; they apply the new migrations normally
-- via "wrangler d1 migrations apply".

-- Original drizzle-kit auto-named history.
DELETE FROM d1_migrations WHERE name IN (
	'0000_init.sql',
	'0001_unknown_jane_foster.sql',
	'0002_aberrant_hobgoblin.sql',
	'0003_spooky_iron_fist.sql',
	'0004_freezing_phantom_reporter.sql'
);

-- Interim three-file history (content/blogger/auth), in case it was applied.
DELETE FROM d1_migrations WHERE name IN (
	'0000_content_schema.sql',
	'0001_blogger_sync.sql',
	'0002_auth_schema.sql'
);

INSERT INTO d1_migrations (name) VALUES
	('0000_publications.sql'),
	('0001_posts.sql'),
	('0002_media.sql'),
	('0003_tags.sql'),
	('0004_post_tags.sql'),
	('0005_blogger_sync.sql'),
	('0006_user.sql'),
	('0007_session.sql'),
	('0008_account.sql'),
	('0009_verification.sql'),
	('0010_rate_limit.sql');

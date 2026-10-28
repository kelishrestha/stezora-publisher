# Backups

Three layers protect the writing. The remote D1 database is the source of
truth; everything else exists so that no single failure can lose it.

| Layer | What | Where | Cadence |
| --- | --- | --- | --- |
| Content export | Every content table raw (posts incl. drafts and markdown, publications, tags, post_tags, media, blogger_sync), one JSON per post | Private backup repo, `content/` | Nightly (GitHub Actions) |
| SQL dump | Byte-exact `wrangler d1 export` of the whole database, auth tables included | Private backup repo, `db/` | Weekly (Sundays) |
| Media files | Every local R2 object written to a folder in this repository, keyed as the database references them | This repo, `media-backup/` | Manual, after uploads or localizations |

Layer zero is D1 Time Travel: `wrangler d1 time-travel info stezora-publisher-db`
shows the restore window; it covers bad writes, not account loss, and expires.

## Running by hand

```sh
pnpm backup:content [dir]          # local D1 via Miniflare; set BACKUP_EXPORT_URL + BACKUP_TOKEN for a live site
pnpm backup:db [out.sql] [--local] # replay-safe SQL dump (remote by default)
pnpm backup:media [dir]            # local R2 objects into media-backup/ (commit the result)
```

The export endpoint is `GET /api/export`, authenticated by an admin session or
`Authorization: Bearer <BACKUP_TOKEN>`. Set the Worker secret with
`wrangler secret put BACKUP_TOKEN`.

## Automation

`.github/workflows/backup.yml` runs the nightly content export and the weekly
dump. Required repository secrets are listed at the top of that file. The
export job fails loudly when the source returns zero posts, so an empty or
broken endpoint can never silently overwrite a good backup. Media is not
automated: with media storage disabled (`ENABLE_MEDIA_STORAGE=false`) the live
site serves images from Blogger, and the authoritative file copies sit in
`media-backup/` in this repository. Rerun `pnpm backup:media` and commit
whenever media changes.

## Restore drill

Run this once after setup, and after any schema change you are unsure about.

1. Create a scratch database: add a temporary D1 binding or use
   `wrangler d1 execute stezora-publisher-db --local` against a fresh checkout
   (`rm -rf .wrangler/state` first if you want a clean slate).
2. Replay the dump: `wrangler d1 execute stezora-publisher-db --local --file db/stezora-publisher.sql`.
3. Rebuild the site from it: `pnpm export:content && pnpm build`. The build
   refuses to produce an empty site, so success here proves the data restored.
4. Spot-check: `wrangler d1 execute stezora-publisher-db --local --command
   "SELECT count(*) FROM posts"` should match the manifest counts in the
   content backup.

The per-post JSON in `content/` is the human-readable fallback: if the SQL
dump is ever unusable, `scripts/db/import-json-to-d1.ts` shows the shape of a
rebuild from JSON (it feeds `src/content/posts/`, which `manifest.json` and
`posts/` mirror with full fidelity).

# Cloudflare backend

This document covers the Cloudflare resources and D1 workflow for the backend
(Phases 4–5). It is maintained as the backend grows; the Phase 4/5 milestones
update it as commands and policies change.

## Resources

| Resource | Binding | Purpose |
| --- | --- | --- |
| D1 database `stezora-publisher-db` | `DB` | Relational persistent data (BetterAuth users/sessions, publications, posts, tags, media, sync state) |
| R2 bucket `stezora-publisher-media` | `MEDIA` | Uploaded media (images, PDFs) |
| Worker `stezora-publisher` | — | Serves static assets + `/api/*` |
| Static assets | `ASSETS` | Astro build output in `./dist` |

Bindings live in `wrangler.jsonc`. After changing them, regenerate the committed
types with:

```bash
pnpm types
```

## One-time remote setup

Run these from a dev machine with `wrangler` authenticated. They only need to
happen once per account/worker:

```bash
wrangler d1 create stezora-publisher-db
wrangler r2 bucket create stezora-publisher-media
```

Paste the `database_id` returned by `wrangler d1 create` into `database_id` in
`wrangler.jsonc` (replace the `00000000-0000-0000-0000-000000000000`
placeholder). Keep the placeholder for local development.

## Local vs remote commands

Local D1 state lives under `.wrangler/state/` (gitignored) and is used by
`wrangler dev` and the `--local` commands below. Remote commands hit the
deployed D1 database.

### Migrations

```bash
pnpm db:migrate          # local
pnpm db:migrate:remote   # remote
```

### Seed

Seed data is generated as idempotent SQL and piped into `wrangler d1 execute`:

```bash
pnpm db:seed          # local
pnpm db:seed:remote   # remote
```

`db:seed` inserts:

- the three publications from `src/lib/publications/data.ts`
  (`INSERT OR IGNORE`, keyed on `slug`, no Blogger ids)
- the single admin user from `ADMIN_EMAIL` / `ADMIN_INITIAL_PASSWORD`
  (`.env.development`), stored in BetterAuth's `user` and `account` tables
  with the BetterAuth-compatible scrypt password hash. The statement updates
  the existing user's name and role idempotently, and the account password is
  replaced only when the generated hash differs.
  The plaintext password is never printed.

Public sign-up is disabled. Provision the owner account only through
`ADMIN_EMAIL` and `ADMIN_INITIAL_PASSWORD`; rotate the password by rerunning
the seed with the new value.

### Backfill content into D1

The Blogger import (`pnpm blogger:import`) still writes JSON files under
`src/content/posts/` (gitignored). D1 becomes the source of truth through a
JSON → D1 bridge:

```bash
pnpm db:backfill          # local
pnpm db:backfill:remote   # remote
```

`db:backfill` reads every post JSON, then emits idempotent SQL:

- posts upsert via `ON CONFLICT (blogger_blog_id, blogger_post_id) DO UPDATE`
  when Blogger ids are present, otherwise
  `ON CONFLICT (publication_id, slug) DO UPDATE`
- tags and `post_tags` backfilled from post metadata with
  `ON CONFLICT ... DO NOTHING`

Re-running is a no-op. Blogger `_BLOG_ID` env values (`.env.development`) are
used to populate `posts.blogger_blog_id`; when a publication has no blog id
configured, its posts keep NULL Blogger ids and upsert via the slug key.

Blogger synchronization in the future (Phase 6) will run on the Worker, not as
a tsx script.

### Export content at build time

`pnpm build` runs `prebuild` first, which regenerates the gitignored post JSON
files under `src/content/posts/` from D1 through `GET /api/content`:

```bash
pnpm export:content   # local (default): reads local D1 via in-process Miniflare
pnpm export:content --remote https://<domain>/api/content
```

The local path boots the Worker in-process with Miniflare against the local D1
state (`.wrangler/state/v3`), so it works after `pnpm db:migrate` +
`pnpm db:seed` + `pnpm db:backfill` without any running server.

Env switches for CI / production builds:

```bash
EXPORT_CONTENT_URL=https://<domain>/api/content pnpm build   # fetch deployed endpoint
pnpm deploy                                                    # refuses to run without EXPORT_CONTENT_URL
```

Setting `EXPORT_CONTENT_URL` is equivalent to `--remote <url>`; without it the
exporter runs in local mode.

The endpoint only returns posts with `status = 'published'` and
`published_at <= now`; drafts and scheduled-future posts never reach the
exported JSON, the static build, sitemap, or RSS. The export is idempotent and
removes stale JSON files so the site is always fully reproducible from D1
(DEVELOPER.md §81).
SEO title and description fields are included in the export and override the
default article title and excerpt in public page metadata when present.

The JSON files under `src/content/posts/` double as an untracked backup of D1
content: they are regenerated from D1 at build time and can restore D1 via
`pnpm db:backfill`. The export refuses to delete existing content when a
response contains zero posts, and it fails on a zero-post export into an empty
directory — so an unseeded/empty D1 or a failed remote endpoint can neither
wipe the backup files nor silently produce an empty site. A site that
legitimately has no posts yet can be built with `EXPORT_CONTENT_ALLOW_EMPTY=1`.

Content is sanitized with the same allowlist as the Blogger import
(`sanitizeContentHtml`) before the exported JSON is written, and again at the
Astro render boundary, so D1 content can never reach readers or the admin
unchecked regardless of how it entered the database.

## Schema notes

- Posts are organized by tags only; there is no categories table.
- `media.post_id` is unique, so each post owns at most one media row.
- Deleting a post removes its tag links, sync row, and media metadata in one D1
  batch, then removes the corresponding R2 objects.
- Two posts with NULL Blogger ids are allowed: the
  `UNIQUE (blogger_blog_id, blogger_post_id)` constraint only applies to
  Blogger-synced posts.
- `posts.canonical_url` stores the post's **Blogger** URL (the original source
  URL preserved at import/backfill). It is exported as `bloggerUrl` for future
  redirect/canonical and sync work. It is **not** the site's canonical — the
  public `<link rel="canonical">` is always derived from `SITE.url` + path
  (`src/lib/seo/seo.ts`). Do not use this column as the public canonical.
- `migrations/0000_init.sql` is the base schema. `0001` adds BetterAuth rate
  limiting, `0002` adds editor Markdown/SEO fields, `0003` scopes tags and
  makes media post-owned, and `0004` adds `posts.featured_image_id`. New
  schema changes must be new numbered migration files, never edits to an
  applied one.

## Worker API conventions

- Public read endpoints (`GET /api/content`) send an explicit `Cache-Control`
  header so Cloudflare caching is deterministic.
- `GET /api/content` intentionally returns the raw `{ publications, posts,
  tags }` payload instead of the `{ success, data }` envelope used
  by other routes. It is a build-time export endpoint consumed by
  `scripts/export-content.ts`, which reads the bare arrays directly. Keep it
  that way; wrap new admin/API routes in `ok`/`fail` instead.
- Error handling: a handler that throws is caught in `worker/index.ts`, logged
  with the request id and **pathname only**, and answered with a generic
  `INTERNAL_ERROR` body. Never log query strings: future OAuth/admin routes may
  carry codes or tokens in query parameters.

## Media

- Uploads go through the `MediaService` (`worker/services/media.ts`): the
  object is stored in the `MEDIA` R2 bucket under a random UUID-prefixed key
  and a row is inserted into `media` (D1). Keys are generated by the server, so
  user-controlled filenames never become R2 keys or paths.
- `MediaService.put` validates before storing: the filename is sanitized with
  `sanitizeFilename` (rejects traversal, control characters, leading dots, and
  names longer than 255 bytes), the MIME type must be in an allowlist, and the
  body is capped at 10 MB. If the D1 insert fails after the R2 write, the
  object is deleted so no orphaned media is left behind.
- `GET /media/:key` serves the object with
  `Cache-Control: public, max-age=31536000, immutable`,
  `X-Content-Type-Options: nosniff`, and the stored `Content-Type`; unknown
  keys return 404. Keys contain no slashes, so the single `:key` route segment
  always matches.
- `MediaService.get` returns `null` (404) when the D1 row is missing *or* the
  R2 object is missing, so either store can be repaired/re-seeded independently.

## Secrets

Never commit real values. Local-only values go in `.dev.vars` for `wrangler dev`
and `.env.development` for tsx scripts; see `.env.example` and
`.dev.vars.example`. Remote secrets are set with `wrangler secret put`.

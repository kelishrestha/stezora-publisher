# Deploying to Cloudflare

The site ships as one Worker: static assets from `dist/` plus the CMS API,
with D1 for content. Media storage (R2) is currently DISABLED
(`ENABLE_MEDIA_STORAGE=false` in `wrangler.jsonc`): the site serves images
straight from the Blogger CDN via each media row's `source_url`, so no R2
bucket and no paid plan are needed. The file bytes are safe in `media-backup/`
in this repository.

The local database is the source of truth (fully imported and curated), so
production is bootstrapped FROM local state with a SQL dump. Do the steps in
order.

## 0. Prerequisites

```sh
npx wrangler login            # or set CLOUDFLARE_API_TOKEN
npx wrangler whoami
```

## 1. Create the database

```sh
npx wrangler d1 create stezora-app-db
```

Paste the printed `database_id` into `wrangler.jsonc` and commit that change.
(Already done if `wrangler.jsonc` carries a real id.)

## 2. Bootstrap the database from local

The JSON backfill can no longer rebuild media rows or featured images (images
were segregated out of content), so use the byte-exact dump. `backup:db`
rewrites the statement order so the dump replays against remote D1, which
runs the file in multiple transactions with foreign keys enforced: tables
first, inserts in dependency order, the posts to media reference cycle broken
via UPDATE statements, then indexes:

```sh
pnpm backup:db backups/bootstrap.sql --local
npx wrangler d1 execute stezora-app-db --remote --file backups/bootstrap.sql
```

The dump includes the schema, every content table, the admin user, and the
`d1_migrations` bookkeeping, so future `pnpm db:migrate:remote` runs apply
only new migrations. Do NOT run the migration-rename reconcile script on this
fresh database.

Sanity check:

```sh
npx wrangler d1 execute stezora-app-db --remote --command "SELECT count(*) FROM posts"
```

Expect the local post count (84 at the time of writing).

The local database already carries everything synced from Neobook (titles,
content, tags, featured images), so the dump brings it along. Run
`pnpm neobook:sync` only BEFORE this bootstrap: it writes to the local
database, and once the site is live the remote database is the source of
truth (re-running the bootstrap later would overwrite live edits).

## 3. Secrets

```sh
openssl rand -hex 32 | npx wrangler secret put BETTER_AUTH_SECRET
openssl rand -hex 32 | npx wrangler secret put BACKUP_TOKEN
```

Record the backup token wherever the GitHub backup secrets live (see
`docs/BACKUP.md`). Auth needs no URL configuration: the Worker derives its
origin from each request.

The Blogger import, stats, and authorize buttons (Settings -> Integrations)
are optional. Blog ids are not configured here: the import reads them from
the posts already linked to each publication, so at least one Blogger post
must exist for that publication.

Set the client id and secret as worker secrets:

```sh
npx wrangler secret put BLOGGER_CLIENT_ID
npx wrangler secret put BLOGGER_CLIENT_SECRET
```

The refresh token can come from either path:

- In-UI (recommended): click Authorize on the integrations page. This runs
  the OAuth consent flow and stores the refresh token in D1 (app_settings),
  so no secret is needed. It requires a Google Cloud OAuth client of type
  "Web application" with these redirect URIs registered:
  `https://<your-domain>/api/admin/blogger/oauth/callback` and, for local
  dev, `http://localhost:8787/api/admin/blogger/oauth/callback`. The flow
  requests the full `blogger` scope, which pageview statistics need.
- CLI: `pnpm blogger:oauth` writes the token to `.secrets/`; set it as a
  worker secret with `npx wrangler secret put BLOGGER_REFRESH_TOKEN`. A
  stored (Authorize) token takes precedence over this secret.

## 4. First deploy (bootstrap)

`pnpm deploy` requires `EXPORT_CONTENT_URL`, which does not exist until the
site is live, so the first deploy builds from local D1:

```sh
pnpm build
npx wrangler deploy
```

Note the `*.workers.dev` URL (or attach a custom domain in the dashboard
under Workers & Pages -> stezora-publisher -> Settings -> Domains & Routes).

## 5. Verify

- `https://<site>/` renders; publication pages and post pages load with
  images served from the external CDNs (`blogger.googleusercontent.com` for
  the Blogger era posts, `s3.twcstorage.ru` for the Neobook ones).
- `https://<site>/admin` redirects to the login page when signed out.
- Sign in with the admin credentials (the bootstrap dump carries the local
  admin user; rotate the password after going live by re-seeding with a new
  `ADMIN_INITIAL_PASSWORD` or changing it via better-auth).
- `curl -H "Authorization: Bearer <BACKUP_TOKEN>" https://<site>/api/export`
  returns the full export.
- Old Blogger-era URLs under `/publications/<slug>/...` redirect to
  `/poetry-collections/...` (public/_redirects).

## 6. Every deploy after that

```sh
EXPORT_CONTENT_URL=https://<site>/api/content pnpm deploy
```

This builds the public site from the LIVE database (never local state) and
deploys. Set `EXPORT_CONTENT_URL` in your shell profile or CI.

## 7. Post-launch

- Activate backups: create the private backup repo and add the workflow
  secrets from `.github/workflows/backup.yml`; run the workflow once manually
  and do the restore drill in `docs/BACKUP.md`.
- Add Cloudflare Web Analytics to the site settings when ready (GOAL.md §13).
- Future schema changes: `pnpm db:generate`, commit the migration, then
  `pnpm db:migrate:remote` before deploying code that needs it.

## Enabling media storage (R2) later

When an R2 bucket becomes an option (requires a payment card on the account,
free tier is generous):

1. `npx wrangler r2 bucket create stezora-publisher-media`
2. In `wrangler.jsonc`: restore the `r2_buckets` binding
   (`{"binding": "MEDIA", "bucket_name": "stezora-publisher-media"}`) and set
   `ENABLE_MEDIA_STORAGE` to `"true"`.
3. Push the bytes: `pnpm deploy:media` uploads every local R2 object (also
   recoverable from `media-backup/`) to the remote bucket under the same keys
   the database rows already reference.
4. Deploy. Media rows carry both `r2_key` and `source_url`, so URLs flip to
   `/media/<key>` with no data changes, and flipping the flag back reverts to
   Blogger URLs.

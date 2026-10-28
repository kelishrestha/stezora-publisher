# Deploying to Cloudflare

The site ships as one Worker: static assets from `dist/` plus the CMS API,
with D1 for content and R2 for media. The local database is currently the
source of truth (fully imported, localized, and curated), so production is
bootstrapped FROM local state: the SQL dump carries every table and the media
push carries the R2 bytes. Do the steps in order.

## 0. Prerequisites

```sh
npx wrangler login            # or set CLOUDFLARE_API_TOKEN
npx wrangler whoami
```

## 1. Create the resources

```sh
npx wrangler d1 create stezora-publisher-db
npx wrangler r2 bucket create stezora-publisher-media
```

Paste the printed `database_id` into `wrangler.jsonc` (it currently holds a
zero placeholder) and commit that change.

## 2. Bootstrap the database from local

The JSON backfill can no longer rebuild media rows or featured images (images
were segregated out of content and localized), so use the byte-exact dump:

```sh
pnpm backup:db backups/bootstrap.sql --local
npx wrangler d1 execute stezora-publisher-db --remote --file backups/bootstrap.sql
```

The dump includes the schema, every content table, the admin user, and the
`d1_migrations` bookkeeping, so future `pnpm db:migrate:remote` runs apply
only new migrations. Do NOT run the migration-rename reconcile script on this
fresh database.

Sanity check:

```sh
npx wrangler d1 execute stezora-publisher-db --remote --command "SELECT count(*) FROM posts"
```

Expect the local post count (83 at the time of writing).

## 3. Push the media objects

```sh
pnpm deploy:media
```

Uploads every local R2 object (the localized Blogger images and any uploads)
to the remote bucket under the same keys the database rows reference.

## 4. Secrets

```sh
openssl rand -hex 32 | npx wrangler secret put BETTER_AUTH_SECRET
openssl rand -hex 32 | npx wrangler secret put BACKUP_TOKEN
```

Record the backup token wherever the GitHub backup secrets live (see
`docs/BACKUP.md`). Auth needs no URL configuration: the Worker derives its
origin from each request. Blogger mirror secrets come later with Phase 6C.

## 5. First deploy (bootstrap)

`pnpm deploy` requires `EXPORT_CONTENT_URL`, which does not exist until the
site is live, so the first deploy builds from local D1:

```sh
pnpm build
npx wrangler deploy
```

Note the `*.workers.dev` URL (or attach a custom domain in the dashboard
under Workers & Pages -> stezora-publisher -> Settings -> Domains & Routes).

## 6. Verify

- `https://<site>/` renders; publication pages and post pages load with
  images served from `/media/...`.
- `https://<site>/admin` redirects to the login page when signed out.
- Sign in with the admin credentials (the bootstrap dump carries the local
  admin user; rotate the password after going live by re-seeding with a new
  `ADMIN_INITIAL_PASSWORD` or changing it via better-auth).
- `curl -H "Authorization: Bearer <BACKUP_TOKEN>" https://<site>/api/export`
  returns the full export.
- Old Blogger-era URLs under `/publications/<slug>/...` redirect to
  `/poetry-collections/...` (public/_redirects).

## 7. Every deploy after that

```sh
EXPORT_CONTENT_URL=https://<site>/api/content pnpm deploy
```

This builds the public site from the LIVE database (never local state) and
deploys. Set `EXPORT_CONTENT_URL` in your shell profile or CI.

## 8. Post-launch

- Activate backups: create the private backup repo and add the workflow
  secrets from `.github/workflows/backup.yml`; run the workflow once manually
  and do the restore drill in `docs/BACKUP.md`.
- Add Cloudflare Web Analytics to the site settings when ready (GOAL.md §13).
- Future schema changes: `pnpm db:generate`, commit the migration, then
  `pnpm db:migrate:remote` before deploying code that needs it.

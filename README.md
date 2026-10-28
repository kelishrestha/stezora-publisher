# Stezora Publisher

A personal multi-publication publishing platform.

**One CMS, three publications, one website.**

Astro renders the public site as static pages. A Cloudflare Worker serves the
admin CMS API with D1 for content and R2 for media. Posts are imported from
Blogger and exported to JSON content files at build time, so the public site
never depends on runtime API calls.

## Development

```sh
pnpm install
pnpm dev          # Astro dev server (public site only)
pnpm dev:cms      # build, then run the Worker with the admin CMS
pnpm dev:worker   # run the Worker alone (wrangler dev)
```

First-time local database setup:

```sh
pnpm db:migrate   # apply migrations to local D1
pnpm db:seed      # seed publications and the admin user
pnpm db:backfill  # import JSON content files into local D1
```

The admin user credentials come from `.env.development` (see `.env.example`).

## Verification

```sh
pnpm lint
pnpm typecheck
pnpm test         # all tests
pnpm test:unit    # unit tests only
pnpm test:worker  # Worker tests (fresh D1 with migrations applied)
pnpm build
```

## Content export

The build reads posts from D1 and writes them to `src/content/posts/` as JSON
(`pnpm build` runs this automatically via `prebuild`):

```sh
pnpm export:content                  # from local D1 via Miniflare
EXPORT_CONTENT_URL=<url> pnpm build  # from a live /api/content endpoint
```

## Blogger

```sh
pnpm blogger:oauth                   # one-time OAuth; stores the refresh token in .secrets/
pnpm blogger:import --blog <slug>    # import one publication
pnpm blogger:import --all            # import all publications
```

Imports are idempotent and keyed by Blogger post ID. Image inventories are
written to `migration-reports/`.

## Deployment

The site deploys to Cloudflare Workers (static assets plus the CMS API):

```sh
EXPORT_CONTENT_URL=<url> pnpm deploy
```

`EXPORT_CONTENT_URL` is required for production deploys so the build never
depends on local D1 state. The build output is `./dist/`, served through the
assets directory defined in `wrangler.jsonc`. First-time setup (creating the
D1 database and R2 bucket, bootstrapping data from local, secrets) is the
step-by-step runbook in `docs/DEPLOY.md`.

See `ARCHITECTURE.md` for the full architecture and implementation phases.

## Backups

Nightly content exports, weekly SQL dumps, and a weekly R2 media mirror; see
`docs/BACKUP.md` for the layers, manual commands, and the restore drill.

```sh
pnpm backup:content   # full-fidelity JSON export (drafts included)
pnpm backup:db        # wrangler d1 export SQL dump
pnpm backup:media     # rclone mirror of the R2 bucket
```

## Database migrations

Migrations live in `migrations/` (one file per table) and apply with:

```sh
pnpm db:generate         # generate a migration from worker/db/schema.ts changes
pnpm db:migrate          # local D1
pnpm db:migrate:remote   # remote D1
```

One-time note: the migration history was renamed on 2026-10-28. A database
that already applied the old filenames must have its migration bookkeeping
rewritten once, BEFORE the next `db:migrate:remote`:

```sh
wrangler d1 execute stezora-publisher-db --remote --file scripts/db/reconcile-migration-rename.sql
```

The local database has already been reconciled. Fresh databases must skip
this and just apply migrations normally.

## Project structure

```text
src/                      Astro frontend
├── components/
│   ├── admin/            React CMS islands (Dashboard, PostEditor, PostList, ...)
│   ├── blog/             PostCard, PostList, PostMeta, Breadcrumbs
│   ├── navigation/       SiteHeader, SiteFooter
│   ├── publication/      PublicationCard, PublicationHeader
│   └── ui/               Container, Button, Card, ThemeToggle
├── content/posts/        JSON content files exported from D1 (gitignored)
├── layouts/              BaseLayout, PublicationLayout, AdminLayout
├── lib/
│   ├── blogger/          Blogger API client, importer, mapper, sanitizer
│   ├── publications/     publication domain model and content collections
│   └── seo/              config, helpers, structured data
├── pages/
│   ├── admin/            CMS pages (login, posts, tags, media)
│   ├── poetry-collections/  collection index, posts, tags, per-collection RSS
│   └── publications/     published books showcase
└── styles/               global.css, theme.css (Tailwind)

worker/                   Cloudflare Worker (CMS API)
├── db/                   Drizzle schema and query modules (posts, tags, media)
├── lib/                  auth (better-auth), http, errors, validation, markdown
├── routes/               /api/content, /media, and admin routes
└── services/             media handling

scripts/
├── backup/               content export, SQL dump, media mirror
├── blogger/              OAuth flow, import CLI, token store
├── db/                   seeding, backfill, migration reconcile SQL
└── export-content.ts     D1 to JSON content export

migrations/               D1 migrations, one file per table
tests/                    Vitest suites (unit and Worker projects)
```

# PLAN.md — Phase 4 (CMS) & Phase 5 (Cloudflare Backend) Implementation Plan

## Document model

This repository keeps two planning documents apart:

- `DEVELOPER.md` — strict development **guidelines** (the rules the code must obey).
- `PLAN.md` (this file) — the **implementation plan** for Phase 4 and Phase 5: ordered tasks, files, steps, acceptance criteria, and tests.

When the rules and this plan disagree, the rules in `DEVELOPER.md` win. Every task below cites the relevant `DEVELOPER.md` section (§N).

## Scope and execution order

- **Phase 5** (Cloudflare backend: Workers + D1 + R2 + API + content export) is the foundation.
- **Theme (M5)** restyles the existing public site and defines the design system before any CMS UI is written.
- **Phase 4** (CMS: auth, dashboard, editor, drafts, publishing, categories/tags, media) is feature work that runs on that foundation and on the theme.
- **Production configuration (M7)** and a final **security check (M8)** close the work.
- Therefore the execution order is **Phase 5 → Theme → Phase 4 → Production → Security**. Blogger synchronization (Phase 6) is explicitly out of scope.

Every milestone must finish with the verification sequence (DEVELOPER.md §48):

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Never claim a check passed without running it.

---

## 1. Current state (assumptions this plan is built on)

> Last updated: M0–M5 and all of M6 (P4.1–P4.6) shipped **and committed**, including the deferred P4.6 step 5: featured-image selection (`posts.featured_image_id`, migration `0004_freezing_phantom_reporter.sql`), the static edit/view shells (`/admin/posts/:id/edit|view` proxied onto single shells, `worker/lib/gate.ts`), the sitemap `/admin` exclusion, and in-editor media upload/insert. Categories are removed entirely; tags are scoped per publication; media is post-owned (`0003_spooky_iron_fist.sql`). Test suite: 177 passed (22 files).

| Area | Current state |
| --- | --- |
| Public site | Astro 7 static site; three publications as data (`src/lib/publications/data.ts`); served by the Worker as static assets (`wrangler.jsonc` has `main`, `assets`, D1 `DB`, R2 `MEDIA`) |
| Content | Gitignored JSON in `src/content/posts/`, named `<publication>-<postSlug>.json`, loaded by the glob loader in `src/content.config.ts`; post id = filename minus `.json` |
| Public routes | `/publications/[slug]/posts/[post].astro` uses `post.id` as the URL segment, so the export must keep this filename convention |
| Databases | Drizzle-managed D1: `0000_init.sql` (all domain tables) + `0001_unknown_jane_foster.sql` (BetterAuth `rate_limit`) + `0002_aberrant_hobgoblin.sql` (posts `content_markdown`, `seo_title`, `seo_description`); schema source of truth is `worker/db/schema.ts` (+ `auth-schema.ts`) |
| Data access | All Worker DB access is Drizzle (`drizzle-orm/d1`); no raw `env.DB.prepare` in application routes |
| Auth | BetterAuth (`worker/lib/auth.ts` + `@better-auth/drizzle-adapter`); `requireAdmin`/`requireRole` in `worker/lib/middleware.ts`; DB-backed rate limiting; `user`/`session`/`account`/`verification`/`rateLimit` tables |
| Styling | Tailwind v4 semantic tokens from `COLORS.md` in `src/styles/theme.css` (light/dark, per-publication `data-accent` overrides); public components refactored off `slate`/`gray` |
| Blogger | Import (Phase 3) done: tsx scripts using `process.env`; import still writes JSON files; `bloggerPostId`/`bloggerUrl` stored on each post |
| Tests | Vitest 4 with two projects (`unit` node pool, `worker` `@cloudflare/vitest-pool-workers`); migrations applied in the worker pool via `readD1Migrations`; worker pool pre-bundles `sanitize-html` via `deps.optimizer.ssr` (fixes the pool's CJS `postcss`→`nanoid` module-fallback failure) |
| Frontend | React islands wired (`@astrojs/react`, react 19); admin dashboard uses them (`Dashboard.tsx`); `marked` and `sanitize-html` available |
| Typecheck | `pnpm typecheck` = `astro check`; `tsconfig.json` includes `**/*`, so `worker/**` and `worker-configuration.d.ts` are typechecked |
| Lint | ESLint flat config already ignores `worker-configuration.d.ts` |
| Secrets | `.env.*` gitignored except `.env.example`; `.dev.vars` gitignored; Blogger values live in `.env.development`; `BETTER_AUTH_SECRET` is the BetterAuth secret |
| SITE.url | `https://stezora-publisher.workers.dev` (a `workers.dev` URL — must never ship as canonical, §84) |

---

## 2. Milestone map

| # | Milestone | Phase | Deliverable | Status |
| --- | --- | --- | --- | --- |
| M0 | Foundation wiring | 5 | Worker entry + homegrown router, bindings, types, tooling, new dependencies | ✅ done |
| M1 | Drizzle schema, seed, backfill | 5 | `worker/db/schema.ts`, drizzle-kit migration (replaces `0001_init.sql`), seed scripts, content backfill | ✅ done |
| M2 | Build-time content export | 5 | `GET /api/content` (now Drizzle + `publications.accent`) + `scripts/export-content.ts` wired as `prebuild` | ✅ done |
| M3 | API framework | 5 | Response envelope, error mapper, validation, middleware (auth guard via BetterAuth) | ✅ done |
| M4 | R2 media service | 5 | Put/get/delete service (Drizzle repository) + public serving route | ✅ done |
| M5 | Theme — COLORS.md tokens + per-publication accents | 1 | Semantic Tailwind theme, public-component refactor, publication themes | ✅ done |
| M6 | Phase 4 CMS features | 4 | BetterAuth auth, dashboard, editor, drafts, categories/tags, media UI | ✅ done |
| M7 | Production configuration | 5 | Manual deploy + GitHub Actions, secrets, docs, checklist | pending |
| M8 | Security check & hardening | — | Audit, security headers, secret scan, `docs/security.md`, pre-deploy gate | pending |

---

## Milestone 0 — Foundation wiring

**Status: done.**

### M0.1 — Worker entry and routing

**Goal:** one Worker serves the static site and dynamic routes (DEVELOPER.md §27).

**Files:**
- `wrangler.jsonc` — add `"main": "./worker/index.ts"`; keep `assets.directory = "./dist"` and `not_found_handling = "404-page"`.
- `worker/index.ts` — request entry.
- `worker/router.ts` — small homegrown router (already exists; keep).

**Steps:**
1. Keep `worker/index.ts`:
   - `export default { fetch(request, env, ctx) }`.
   - Routing decision: `/api/auth/*` → BetterAuth handler (wired in M6 P4.1); `/api/*` → API handlers; `/admin/*` → admin gate then static asset (gate implemented in M6 P4.1); anything else → `env.ASSETS.fetch(request)`.
2. Keep the dependency-free router (path-to-regexp-style, no new package, §40): route table of `[method, pattern, handler]`, path params, 404 for unmatched pattern, method-mismatch → 405.
3. Use an `Env` interface from `worker-configuration.d.ts` (see M0.2) for bindings; never access `env` properties that do not exist. Secrets (`BETTER_AUTH_SECRET`) are added to `Env` manually (see M0.4).

**Acceptance:** `pnpm typecheck` passes with `worker/**` included; unmatched routes fall through to static assets.

**Tests:** `tests/worker/router.test.ts` — existing tests stay green (path→handler matching, params, unknown route → 404, method mismatch → 405).

### M0.2 — Bindings and generated types

**Files:** `wrangler.jsonc`, `worker-configuration.d.ts` (generated, committed), `tsconfig.json`, `worker/env.d.ts`.

**Steps:**
1. Bindings already in `wrangler.jsonc` (D1 `DB` with `migrations_dir: ./migrations`, R2 `MEDIA`). Keep them.
2. Keep dev dependency `@cloudflare/workers-types`; keep `"types": "pnpm wrangler types"` script; **commit** `worker-configuration.d.ts` (eslint already ignores it; `tsconfig` `include: ["**/*"]` picks it up so `astro check` covers worker bindings).
3. Add `BETTER_AUTH_SECRET` (string) to the `Env` interface in `worker/env.d.ts` — a secret binding resolved from `.dev.vars`/`wrangler secret put`, never committed.

**Acceptance:** `wrangler types` regenerates the file; `pnpm typecheck` passes; `Env` includes `DB`, `MEDIA`, `ASSETS`, `BETTER_AUTH_SECRET`.

### M0.3 — Dependencies and test tooling

**Goal:** worker tests against real D1/R2 emulation; Drizzle + BetterAuth available; React available for Phase 4.

**Files:** `package.json`, existing `vitest.config.mts`, `tests/**`.

**Steps:**
1. devDependencies:
   - `@cloudflare/vitest-pool-workers` — run Worker routes with Miniflare-backed D1/R2 (already present).
   - `zod` (direct dependency) — shared request validation (§44); the existing `astro/zod` import stays for content schema only.
   - **Drizzle**: `drizzle-orm` (direct dependency, `drizzle-orm/d1`), `drizzle-kit` (dev) for migration generation.
   - **BetterAuth**: `better-auth` (direct dependency), `@better-auth/drizzle-adapter` (direct), `@better-auth/cli` (dev) for generating the auth schema.
   - Phase 4 (can be added with M6 P4.1): `@astrojs/react`, `react`, `react-dom`, `@types/react`, `@types/react-dom`.
2. Keep `vitest.config.mts` with two projects so existing node-pool tests keep working (`unit` default node pool, `worker` pool `@cloudflare/vitest-pool-workers`). The worker pool keeps `readD1Migrations(...)` from `migrations/` (drizzle-generated `NNNN_*.sql` files are compatible).
3. npm scripts stay: `test:unit`, `test:worker` (keep `test` = `vitest run` running both).

**Acceptance:** existing tests still pass unchanged; a hello-world worker route test runs against local D1.

### M0.4 — Development workflow

**Files:** `package.json`, `.env.example`, `.dev.vars.example`, `worker/env.d.ts`.

**Steps:**
1. Keep `astro dev` for public-only development.
2. Keep `dev:worker` = `wrangler dev` (serves `dist` assets + worker + local D1/R2). It requires `pnpm build` first — document as `pnpm build && pnpm dev:worker`.
3. `.dev.vars.example` (committed) gains `BETTER_AUTH_SECRET=` and `BETTER_AUTH_URL=http://localhost:8787` placeholders; document that `wrangler dev` reads `.dev.vars` (gitignored). Add the same keys to `.env.example` for reference (§46). **Remove** the old `AUTH_SECRET` placeholder (renamed to `BETTER_AUTH_SECRET`).

**Acceptance:** a developer can run the full stack (site + API + D1 + R2) locally with documented commands.

---

## Milestone 1 — Drizzle schema, seed, backfill

**Status: done.**

Drizzle is the **only** data-access layer: `drizzle-orm/d1` in the Worker, and `drizzle-kit` for migration generation. No raw `env.DB.prepare(...)` in application code.

### M1.1 — Schema and initial migration (drizzle-kit)

**Goal:** one Drizzle schema that is the source of truth for the D1 database, generated into a single initial migration that **replaces** `0001_init.sql` (DEVELOPER.md §24, §25, §81 rule 5). No production D1 exists yet, so the migration history is regenerated rather than patched.

**Files:**
- `drizzle.config.ts` (root) — `dialect: 'sqlite'`, `driver: 'd1'`, `dbCredentials: { wranglerConfigPath: './wrangler.jsonc', dbName: 'stezora-app-db' }`, `out: './migrations'`, `schema: './worker/db/schema.ts'`.
- `worker/db/schema.ts` — all tables as Drizzle `sqliteTable`.
- `worker/db/auth-schema.ts` — generated by `@better-auth/cli` (auth core tables).
- `migrations/` — delete `0001_init.sql`; regenerate via `drizzle-kit generate`.

**Steps:**
1. Write `better-auth.config.ts` (CLI-only) that imports the auth instance shape from `worker/lib/auth.ts` (created in M6 P4.1; for M1 define it with the database adapter against D1). Run `pnpm dlx @better-auth/cli generate --config ./better-auth.config.ts --output ./worker/db/auth-schema.ts` to emit the official `user`, `session`, `account`, `verification`, `rateLimit` tables.
2. Define domain tables in `worker/db/schema.ts` (mirrors the old `0001_init.sql` minus `users`/`login_attempts`):

```ts
// publications: id, name, slug (unique), description, accent (nullable text,
//   one of the COLORS.md palette ids — see M5), blogger_blog_id, blogger_url, created_at
// posts: id, publication_id FK, title, slug, excerpt,
//   content, status ('draft'|'scheduled'|'published'|'archived', default draft),
//   published_at, updated_at, canonical_url, blogger_blog_id, blogger_post_id, created_at,
//   unique(publication_id, slug), unique(blogger_blog_id, blogger_post_id)
// tags: id, publication_id FK, name, slug, unique(publication_id, slug)
// post_tags: post_id FK, tag_id FK, pk(post_id, tag_id)
// media: id, post_id FK (unique), publication_id FK, r2_key (unique), filename, mime_type, size, created_at
// blogger_sync: id, post_id FK, blogger_blog_id, blogger_post_id, status,
//   last_synced_at, error, unique(post_id)
```

   Indexes (as in the old schema): `posts(publication_id, status)`, `posts(publication_id, slug)`, `posts(blogger_blog_id, blogger_post_id)`, `post_tags(tag_id)`, `tags(publication_id)`, `media(post_id)`.
3. Fold the auth tables into `worker/db/schema.ts` (re-export from `auth-schema.ts`).
4. `drizzle-kit generate` produces the initial `migrations/0000_*.sql` (all tables + constraints + indexes). Remove the stale `0001_init.sql`; regenerate the drizzle `meta/_journal.json` accordingly so `wrangler d1 migrations apply` and `readD1Migrations` (vitest) see exactly one migration.
5. Apply locally: `wrangler d1 migrations apply stezora-app-db --local`; verify constraint failures surface as errors (existing `tests/worker/db-schema.test.ts`, extended in M6 for auth tables).

**Acceptance:** local migration applies cleanly; constraint violations surface as errors; the `user`/`session` auth tables exist alongside the domain tables.

**Tests:** `tests/worker/db-schema.test.ts` (extended) — duplicate `publications.slug` rejected; duplicate `posts(publication_id, slug)` rejected; duplicate `(blogger_blog_id, blogger_post_id)` rejected; two posts with NULL Blogger ids allowed; `user`/`session` tables exist.

### M1.2 — Databases and bindings

**Steps:**
1. Local: `wrangler d1 migrations apply stezora-app-db --local`.
2. Remote (one-time, from a dev machine): `wrangler d1 create stezora-app-db`, `wrangler r2 bucket create stezora-publisher-media`; paste the returned `database_id` into `wrangler.jsonc`.
3. Document both in `docs/cloudflare.md`.

### M1.3 — Seed scripts

**Goal:** reproducible seed data (DEVELOPER.md §13, §46).

**Files:** `scripts/db/seed-publications.ts`, `scripts/db/seed-admin.ts`.

**Steps:**
1. `seed-publications.ts` — build Drizzle `insert(...).onConflictDoNothing()` statements for the three publications from `src/lib/publications/data.ts` (including the new `accent` field — see M5), render to SQL with `toSQL` (from `drizzle-orm/sql`), and print the SQL. Say: use `toSQL` instead of the hand-rolled string builder.
2. `seed-admin.ts` — reads `ADMIN_EMAIL` and `ADMIN_INITIAL_PASSWORD` from env (never defaults, never printed). Generates a **BetterAuth-compatible** password hash with `createHash` from `better-auth/crypto` (same scrypt parameters the runtime uses; see M1.3 test note). Emits an idempotent `INSERT INTO user (...) VALUES (...) ON CONFLICT (email) DO UPDATE SET password = excluded.password WHERE user.password != excluded.password` SQL statement via `toSQL`.
3. `scripts/db/sql.ts` (hand-rolled string helpers) is **deleted**; the seed/backfill scripts emit SQL from Drizzle `toSQL` so local (`wrangler d1 execute --local`) and remote (`--remote`) seeding keep the same workflow.
4. Keep `db:seed`, `db:seed:remote` scripts (wrangler executes the generated SQL).

**Tests:**
- `tests/better-auth-hash.test.ts` (replaces `tests/password.test.ts`) — `createHash`/`verifyPassword` from `better-auth/crypto` round-trip, wrong password fails, hash contains no plaintext, format matches the documented BetterAuth hash envelope.
- `tests/seed-admin.test.ts` (rewritten) — emitted SQL targets the `user` table, contains no plaintext password, and only rewrites the hash when it differs.

### M1.4 — Backfill content into D1

**Goal:** D1 becomes the single source of truth without re-running the Blogger API (§81 rules 4–5).

**Files:** `scripts/db/import-json-to-d1.ts`.

**Steps:**
1. Script reads every existing JSON file in `src/content/posts/` (reuse `readExistingPosts` shape from `src/lib/blogger/storage.ts`), maps `PostRecord` → `posts` row (`publication` → `publication_id` via slug lookup, `pubDate`/`updatedDate` → ISO timestamps).
2. Builds Drizzle statements and emits SQL via `toSQL`, using `onConflictDoUpdate` targeted at `(blogger_blog_id, blogger_post_id)` when Blogger ids are present, otherwise `(publication_id, slug)` — re-running never duplicates (§18, §81 rule 5).
3. Also backfills `tags`, `post_tags` from the post metadata (per-publication slug scoping, `onConflictDoNothing`) and one `media` row per post from the first content image.
4. Keep `db:backfill` / `db:backfill:remote` scripts that generate the SQL and pipe it through `wrangler d1 execute --local/--remote`.
5. Blogger import (tsx) is unchanged: it still writes JSON. D1 backfill is the JSON→D1 bridge. Note in `docs/cloudflare.md` that future Blogger sync runs on the Worker (Phase 6).

**Acceptance:** after backfill, the local D1 contains the same published posts as the JSON files, and re-running is a no-op.

**Tests:** `tests/import-json-to-d1.test.ts` — generate SQL from a fixture and assert ON CONFLICT clauses present and escaping is correct.

---

## Milestone 2 — Build-time content export

**Status: done.**

### M2.1 — `GET /api/content` endpoint

**Goal:** a read-only endpoint that reproduces the site content at build time (DEVELOPER.md §81 rule 6, §57).

**Files:** `worker/routes/content.ts` (now Drizzle-backed).

**Steps:**
1. Public, no auth. Returns `{ publications, posts, tags }`.
2. Rewrite the queries with `drizzle-orm/d1` (typed selects) instead of `env.DB.batch(...)`.
3. `posts` filtered to `status = 'published' AND published_at <= now` — drafts/scheduled/archived never appear (§57).
4. Post shape must match `src/content.config.ts` exactly so the Astro loader and pages work unchanged:
   `title`, `excerpt`, `publication` (slug), `tags` (names), `pubDate` (ISO), `updatedDate` (ISO, optional), `status` (`'published'`), `content` (sanitized HTML), `bloggerPostId`, `bloggerUrl`.
5. `publications` additionally includes `accent` (per-publication theme id, consumed by the frontend via `src/lib/publications/data.ts`; included here for parity).
6. `tags` are flattened to the same strings the JSON files use today; the `tags` table feeds the CMS, not the public shape.

**Tests:** `tests/worker/content.test.ts` — published posts returned, drafts excluded, scheduled future posts excluded, shape matches the content schema (assert against a zod parse of the response), `accent` present.

### M2.2 — Exporter script wired as `prebuild`

**Goal:** the static build is reproducible from D1 with no running server in CI (DEVELOPER.md §69, §81 rules 2–3, 7).

**Files:** `scripts/export-content.ts`, `package.json`.

**Steps:**
1. `scripts/export-content.ts` (unchanged behavior):
   - `--local` (default): boot the Worker in-process via Miniflare against local D1/R2 state, call `GET /api/content`.
   - `--remote <url>`: fetch the deployed `GET /api/content` (used by CI and manual production builds).
   - Writes `src/content/posts/<publication>-<postSlug>.json` (reuse `postFilename`/`writePost` conventions from `src/lib/blogger/storage.ts`) so `post.id` remains the slug (public post URLs stay stable, §82).
2. Keep `"prebuild": "pnpm export:content"` so `pnpm build` always regenerates content. Document the `EXPORT_CONTENT_URL` env switch (remote mode; production builds must set it).
3. Keep JSON files gitignored (they remain build artifacts).

**Acceptance:** `pnpm build` succeeds from a fresh checkout once D1 is seeded (content regenerated, never committed).

**Tests:** exporter is idempotent (two runs produce identical files); drafts absent; filenames match `<publication>-<slug>.json`.

---

## Milestone 3 — API framework

**Status: done.**

### M3.1 — Response envelope and error mapping

**Goal:** one response format everywhere; no internal leakage (DEVELOPER.md §38, §43).

**Files:** `worker/lib/http.ts`, `worker/lib/errors.ts`.

**Steps:**
1. Envelope helpers: `ok(data)` → `{ success: true, data }`; `fail(code, message, status)` → `{ success: false, error: { code, message } }` (already implemented).
2. `ApiError` class carrying `status` + `code`; an `errorMapper(error)` converts any thrown error to a response: `ApiError` → its status, zod errors → 400 `VALIDATION_ERROR`, everything else → 500 `INTERNAL_ERROR` with a generic message (never a stack trace or internal text).
3. Every handler is wrapped by the mapper.

**Tests:** `tests/worker/http.test.ts` — existing tests stay green.

### M3.2 — Validation and middleware

**Files:** `worker/lib/validate.ts`, `worker/lib/middleware.ts`.

**Steps:**
1. `validateWith(schema, data)` using `zod`; all request bodies, URL params, and query params validated server-side (§44).
2. Middleware: request ID (UUID added to headers/logs), JSON body size limit (e.g. 2 MB), and the `requireAdmin` auth guard. `requireAdmin` (DEVELOPER.md §12) is implemented in M6 P4.1 over BetterAuth and wired here via `routes.get('/api/admin/stats', requireAdmin(adminStats))`.

**Tests:** validation failures → 400 with code; oversize body → 413.

---

## Milestone 4 — R2 media service

**Status: done.**

### M4.1 — Media service

**Goal:** binary media in R2, metadata in D1 (DEVELOPER.md §28, §29).

**Files:** `worker/services/media.ts` (unchanged contract), `worker/db/media.ts` (rewritten onto Drizzle).

**Steps:**
1. `putMedia(file: Blob, metadata)`: generate key `crypto.randomUUID() + '-' + sanitizedFilename` — never the raw user filename, no path traversal (§29); `MEDIA.put(key, file, { httpMetadata: { contentType } })`; insert `media` row.
2. `getMedia(key)` / `deleteMedia(key)`: R2 object + D1 row together.
3. Filename sanitizer: strip directories/control chars, keep extension; MIME sniffing and validation live at the upload endpoint (M6 P4.6).
4. `MediaRepository` is rewritten with `drizzle-orm/d1` typed queries (`insert`, `select where key/id`, `select order by created_at desc limit/offset`, `delete where id`) — behavior identical to today.

**Tests:** `tests/worker/media.test.ts` — key generation (no user input in path), upload stores both R2 + D1, delete removes both.

### M4.2 — Public media route

**Files:** `worker/routes/media.ts` (unchanged).

**Steps:** `GET /media/:key` → R2 object with correct `Content-Type` and `Cache-Control: public, max-age=31536000, immutable`; 404 when missing.

**Tests:** route returns the object with headers; missing key → 404.

---

## Milestone 5 — Theme: COLORS.md tokens + per-publication themes

**Status: done.**

**Goal:** define the design system from `COLORS.md` (oklch ramps + mode rules) as semantic Tailwind tokens, restyle every existing public component off the Tailwind defaults, and give each publication a distinct **accent** (accent-only override; site background/primary/secondary/muted stay shared per `COLORS.md`). Theme logic stays purely presentational (§66).

**Palette assignments (data, not UI branching — §8, §41):**

| Publication | Accent palette |
| --- | --- |
| `the-sore-transition` | `dark-amaranth` |
| `the-rebellious-flame` | `bright-amber` |
| `my-soulful-incantations` | `soft-periwinkle` |

### M5.1 — Design tokens from COLORS.md

**Files:** `src/styles/theme.css` (new), `src/styles/global.css`.

**Steps:**
1. In `theme.css`, add every COLORS.md ramp to Tailwind v4 `@theme` as colors (`--color-space-indigo-*`, `--color-ocean-deep-*`, `--color-dark-amaranth-*`, `--color-bright-amber-*`, `--color-soft-periwinkle-*` with the exact oklch values from COLORS.md).
2. Define semantic tokens for both modes per the COLORS.md rules:

```css
:root {                     /* light */
  --color-background: var(--color-ocean-deep-50);
  --color-primary: var(--color-soft-periwinkle-400);
  --color-secondary: var(--color-ocean-deep-400);
  --color-accent: var(--color-dark-amaranth-400);
  --color-muted: var(--color-bright-amber-50);
}
.dark {                     /* dark */
  --color-background: var(--color-space-indigo-700);
  --color-primary: var(--color-soft-periwinkle-50);
  --color-secondary: var(--color-bright-amber-100);
  --color-accent: var(--color-dark-amaranth-100);
  --color-muted: var(--color-bright-amber-50);
}
```

   plus *derived* tokens for text, borders, and surfaces (e.g. `--color-foreground`, `--color-surface`, `--color-border`, hover shades) chosen from the ramps to guarantee readable contrast (§64) in both modes. Document each pairing in the CSS comments.
3. `global.css` imports `theme.css`, keeps the typography plugin, the `dark` custom-variant, and `color-scheme`.

**Acceptance:** `tailwind`/build resolves every semantic token; both modes follow the COLORS.md rules exactly.

### M5.2 — Public component refactor

**Goal:** no hard-coded `slate`/`white`/`gray` palette utilities in public markup; every color comes from a semantic token.

**Files:** `src/layouts/BaseLayout.astro`, `BlogLayout.astro`, `PublicationLayout.astro`; `src/components/navigation/{SiteHeader,SiteFooter}.astro`; `src/components/ui/{Button,Card,Container,ThemeToggle}.astro`; `src/components/blog/{PostCard,PostMeta,Breadcrumbs}.astro`; `src/components/publication/{PublicationCard,PublicationHeader}.astro`.

**Steps:**
1. Replace palette utilities with semantic classes built on the tokens (e.g. `bg-background text-foreground`, `border-border`, `bg-surface`, `text-muted-foreground`, primary/secondary buttons as `bg-primary text-on-primary`).
2. `ThemeToggle.astro` and the color-scheme inline script in `BaseLayout.astro` are unchanged in behavior (dark mode still toggles `.dark` + localStorage).
3. `Container`, `Card` keep their API; only class contents change.

**Acceptance:** both modes render from COLORS.md rules; contrast spot-checks pass (§64).

**Tests:** `tests/theme.test.ts` — parses `COLORS.md` and asserts (a) every ramp value and mode rule appears in `theme.css`, (b) no `slate|gray|white|black` Tailwind utilities remain in `src/components/**` and `src/layouts/**`.

### M5.3 — Per-publication accents

**Goal:** each publication's landing pages carry its accent palette, driven by data (§8, §41), overriding only the accent (site-wide background/primary/secondary/muted stay shared).

**Files:**
- `src/lib/publications/types.ts` — add `export type PublicationAccent = 'space-indigo' | 'ocean-deep' | 'dark-amaranth' | 'bright-amber' | 'soft-periwinkle';` and `accent: PublicationAccent` on `Publication`.
- `src/lib/publications/data.ts` — the three assignments above.
- `src/layouts/PublicationLayout.astro` / `src/components/publication/PublicationHeader.astro` — render the accent.
- `src/styles/theme.css` — accent override styles.

**Steps:**
1. In `theme.css`, define accent modifiers keyed on a `data-accent` attribute, e.g.:

```css
:root[data-accent='dark-amaranth'] { --color-accent: <ramp>; --color-accent-soft: ...; }
:root[data-accent='bright-amber']  { --color-accent: <ramp>; --color-accent-soft: ...; }
:root[data-accent='soft-periwinkle'] { --color-accent: <ramp>; --color-accent-soft: ...; }
```

   Light and dark values both come from the corresponding COLORS.md ramp (accent rule shade per mode). Only the accent (and its soft/contrast shades) is overridden — background/primary/secondary/muted remain site-wide.
2. `PublicationLayout.astro` sets `data-accent={publication.accent}` on `<html>` (or the publication page root). Apply the accent to links, tag chips, and accent buttons on the publication landing pages, listing pages, and post pages under that publication.
3. No UI branch on slug values; consumers use `publication.accent` as data.

**Acceptance:** each publication homepage and its post pages tint with the assigned accent while the site chrome stays shared; changing a slug's `accent` in `data.ts` restyles without code changes.

**Tests:** `tests/publications.test.ts` (extended) — every publication has a valid `accent`; `tests/theme.test.ts` asserts the three `data-accent` overrides exist in `theme.css`.

---

## Milestone 6 — Phase 4 CMS features

All admin UI is built on the M5 semantic tokens (no `slate`); the theme is settled **before** this milestone so nothing is restyled twice.

### P4.1 — Authentication (BetterAuth)

**Status: done.**

**Goal:** server-side auth on every protected operation; UI hiding is never the boundary (DEVELOPER.md §12, §13, §46).

**Files:**
- `worker/lib/auth.ts` — BetterAuth instance factory.
- `worker/routes/auth.ts` — thin wrappers only if needed; BetterAuth serves its own `/api/auth/*` `auth.handler`.
- `worker/lib/middleware.ts` — `requireAdmin()` over `auth.api.getSession`.
- `worker/index.ts` — route `/api/auth/*` and the `/admin/*` gate.
- `scripts/db/seed-admin.ts` — already rewritten in M1.3.
- `tests/password.test.ts` — replaced by `tests/better-auth-hash.test.ts` in M1.3.

**Steps:**
1. `createAuth(env, baseURL)` returns `betterAuth({ ... })`:
   - `database: drizzleAdapter(drizzle(env.DB, { schema }), { provider: 'sqlite' })`, `appName: 'stezora-publisher'`,
   - `secret: env.BETTER_AUTH_SECRET`,
   - `baseURL` from the request origin (`new URL(request.url).origin`), `trustedOrigins` from env (dev localhost + production domain),
   - `emailAndPassword: { enabled: true }`,
   - `user: { additionalFields: { role: { type: 'string', defaultValue: 'admin', input: false } } }`,
   - `rateLimit: { enabled: true }` (DB-backed `rateLimit` table) — replaces the custom `login_attempts` mechanism and gives per-IP login throttling out of the box.
2. `worker/index.ts`: paths starting `/api/auth` (including `.well-known`) are passed to `auth.handler(request)`. The `/admin/*` gate: `/admin/login` is public; any other `/admin/*` request without a valid session → 302 `/admin/login`; with a session → `env.ASSETS.fetch(request)`.
3. `requireAdmin()`: `const session = await auth.api.getSession({ headers: request.headers })`; missing/invalid → 401 `UNAUTHORIZED`; otherwise set `ctx.user = { id, email, role }`. Used by every `/api/admin/*` route.
4. Login page (P4.2) uses `createAuthClient` (`signIn.email`); logout via `client.signOut()`. No custom session tokens, no `AUTH_SECRET` HMAC code.
5. Session revocation = rotating `BETTER_AUTH_SECRET` (documented, §46). Cookie attributes (HttpOnly, Secure on prod, SameSite) are controlled by BetterAuth config and verified by tests.

**Acceptance:** every `/api/admin/*` and `/admin/*` request without a valid session is rejected (401/302); wrong email and wrong password return an identical generic failure; UI hiding is never the security boundary.

**Tests:** `tests/worker/auth.test.ts` (worker pool) — end-to-end login against the seeded admin (also proves the M1.3 seed hash verifies at runtime); wrong password and wrong email give identical errors; protected route 401 without session; rate limit kicks in; logout invalidates; `/admin` gate redirects to `/admin/login`; no `BETTER_AUTH_SECRET` appears in any response or log.

### P4.2 — Login page and dashboard

**Status: done.**

**Goal:** the owner can sign in and see per-publication stats.

**Files:**
- `src/pages/admin/login.astro` — static page + small inline script (no React): `signIn.email` via `createAuthClient`, then `window.location = '/admin'`.
- `src/pages/admin/index.astro` — dashboard shell on M5 tokens.
- `src/layouts/AdminLayout.astro` — admin nav (Dashboard, Posts, Media, Categories, Tags) using M5 semantic tokens.
- `src/components/admin/Dashboard.tsx` — React island fetching `/api/admin/stats`.
- `worker/routes/admin/stats.ts` — `GET /api/admin/stats` (`requireAdmin`).

**Steps:**
1. Stats endpoint returns: posts per status per publication, total media, recent posts.
2. Admin static pages are shells only — all data comes from `/api/*`; `dist` contains no draft content.
3. Handle `/admin` and `/admin/login` asset rewriting in the Worker (`/admin` → `/admin/index.html`).

**Tests:** stats shape; counts are publication-scoped; draft counts separated from published.

### P4.3 — Editor

**Status: shipped (`4e6b05c` + prior).** PostRepository, posts admin routes
(`GET/POST /api/admin/posts`, `GET/PUT /api/admin/posts/:id`, `POST .../publish`,
`POST .../preview`), the Markdown→sanitized-HTML pipeline (`marked` +
`sanitizeContentHtml`), the posts list/new pages, `PostEditor.tsx` React island,
and `tests/worker/posts.test.ts` are all in. Test suite: 154 passed (19 files).

**Editor is static (no SSR needed):** the edit page
`src/pages/admin/posts/edit.astro` is a static shell — the Worker proxies
`/admin/posts/:id/edit` onto `/admin/posts/edit/index.html` (`isAdminEditPath` /
`adminAssetPath` in `worker/lib/gate.ts`) and `PostEditor` parses the id from
`window.location.pathname` to load the post via `GET /api/admin/posts/:id`. The
documented URL scheme `/admin/posts/:id/edit` is preserved without Server-side
rendering, so the whole site stays statically built and `pnpm build` is green.
`pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

**Goal:** one editor for all three publications (§14, §82, §83).

**Files:**
- `worker/db/posts.ts` — `PostRepository` on Drizzle (list with filters, get, insert, update, slug-uniqueness check within publication).
- `worker/routes/admin/posts.ts` — `GET/POST /api/admin/posts`, `GET/PUT /api/admin/posts/:id`, `POST /api/admin/posts/:id/publish`, `POST /api/admin/posts/:id/preview`.
- `src/pages/admin/posts/index.astro`, `src/pages/admin/posts/new.astro`, `src/pages/admin/posts/edit.astro`, `src/pages/admin/posts/[id].astro`.
- `src/components/admin/PostEditor.tsx` — React island.

**Steps:**
1. Editor fields (§14): title, content (Markdown), publication, slug, excerpt, tags, featured image, SEO title/description, publish date, status.
2. Content pipeline (§83): on every save, `marked.parse(markdown)` → HTML → `sanitizeContentHtml` (reuse `src/lib/blogger/sanitize.ts`; works on Workers) → store sanitized HTML in `posts.content`. Sanitizer runs on **every** write path, never assumed stale-safe.
3. Slug (§82): auto-generate from title with the existing `slugify`; editable; validate lowercase, not equal to the publication slug, unique within the publication. Public post path derives from `(publication.slug, post.slug)`, never the filename.
4. Preview (§63): `POST /api/admin/posts/:id/preview` (auth required) returns HTML through the same render pipeline as production. Draft preview is authenticated-only.
5. Tags in the editor are loaded from the CMS tables (P4.5).

**Tests:** create/update; slug generation + uniqueness + publication-slug collision; publication assignment; sanitizer re-runs on edit (malicious markdown/HTML stripped on write, §83 rule 4); status transitions; preview of a draft requires auth.

### P4.4 — Drafts and publishing

**Status: shipped.** Typed statuses (`PostStatus`), idempotent publish
(`PostRepository.setStatus` stamps `published_at` only when absent), and the
visibility gates are in place. `GET /api/content` filters
`status = 'published' AND published_at <= now`; RSS and all public pages go
through `getPublishedPosts`. The sitemap is generated by the existing
`@astrojs/sitemap` integration (`/sitemap-index.xml` → `sitemap-0.xml`),
configured with a `filter` that excludes the `/admin/*` CMS shell (§57); robots.txt
and `BaseLayout` already pointed at the index. Scheduling is `scheduled` status +
future `published_at`, gated only by the export filter — no background worker.
Covered by `tests/worker/content.test.ts` (draft/scheduled-future/archived
excluded), `tests/worker/posts.test.ts` (idempotent publish), and
`tests/sitemap.test.ts` (config guard: integration present, admin excluded,
index wired).

**Goal:** typed statuses; drafts never public; publish is idempotent (DEVELOPER.md §9, §22, §57, §58).

**Files:** `worker/routes/admin/posts.ts` (status logic), `worker/services/publishing.ts`.

**Steps:**
1. Status type: `draft | scheduled | published | archived` used everywhere (no stray strings).
2. Publish sets `published_at` when absent; re-publish is a no-op/update, never a duplicate.
3. Drafts/scheduled-future/archived never appear in `GET /api/content`, sitemap, RSS, or public pages (export filter already enforced in M2.1; sitemap/RSS use `getPublishedPosts` which filters `status === 'published'`).
4. Scheduling: `scheduled` status + `published_at` in the future; only the export filter gates visibility — no background worker.

**Tests:** draft excluded from export; publish idempotent; scheduled future posts not returned early; archived excluded.

### P4.5 — Tags

**Status: shipped.** Tags scoped per publication, no categories; deletion
blocked while referenced (409 `IN_USE`). `worker/db/tags.ts` repository,
`worker/routes/admin/tags.ts` CRUD, `src/pages/admin/tags/index.astro`,
`src/components/admin/TagManager.tsx` are in. Covered by
`tests/worker/categories-tags.test.ts` (renamed `tests/worker/tags.test.ts`).

**Goal:** tags scoped to a publication, with a documented deletion policy (§10).

**Files:**
- `worker/db/tags.ts` — Drizzle repository.
- `worker/routes/admin/tags.ts` — `GET/POST/PUT/DELETE /api/admin/tags`.

**Steps:**
1. CRUD endpoints (`requireAdmin`); `tags.slug` unique per publication.
2. Deletion policy: **block** deleting a tag still referenced by a post (409 `IN_USE` with a message) — no silent reassignment. Document the policy in `docs/cloudflare.md`.
3. Export (M2.1) flattens tag names onto each post so public pages keep working.

**Tests:** tag scoped to its publication; duplicate slug rejected within a publication, allowed across publications; deletion blocked while referenced; export flattening correct.

### P4.6 — Media manager UI

**Status: done.** Upload validates server-side (size, MIME allowlist,
extension) in `worker/routes/admin/media.ts` via `MediaService`; admin page
`src/pages/admin/media/index.astro` + `src/components/admin/MediaManager.tsx`.
Featured-image selection (step 5) is implemented: `posts.featured_image_id`
(migration `0004`) references the post's own media row; `PUT /api/admin/posts/:id`
validates it (`UNKNOWN_MEDIA`, `PUBLICATION_MISMATCH`) and `AdminPost` carries a
resolved `featuredImage` object. The editor sidebar uploads media for the saved
post, marks/clears it as featured, and inserts `![alt](url)` into the content;
the dashboard's recent posts link to view/edit.
Verified by `tests/worker/admin-media.test.ts` and `tests/worker/posts.test.ts`.

**Goal:** upload, list, select, reuse, view metadata, insert into article (DEVELOPER.md §29, §62).

**Files:**
- `worker/routes/admin/media.ts` — `POST /api/admin/media` (`requireAdmin`), `GET /api/admin/media`.
- `src/pages/admin/media/index.astro`, `src/components/admin/MediaManager.tsx`.

**Steps:**
1. Upload via `request.formData()` (native on Workers — no new dependency): `file` + `postId` + `publicationId`.
2. Server-side validation (§29): size limit (10 MB), MIME allowlist (image/*, PDF), extension check, key from UUID + sanitized filename (M4.1).
3. Media belongs to one post (and its publication): the server resolves the post's publication and rejects a mismatched `publicationId`; `media.post_id` is unique so each post holds at most one media row.
4. Manager UI: upload, list (with metadata + public URL `/media/:key`), select/reuse, insert `![alt](url)` markdown into the open editor.
5. Featured-image selection on a post stores `media.id` → `posts.featured_image_id` (column added in a later migration if required — keep schema minimal until then).

**Tests:** oversize and disallowed MIME rejected; bad extension rejected; successful upload → R2 object + `media` row (with post/publication ids, publication mismatch rejected) + working public URL.

---

## Milestone 7 — Production configuration and deployment

### M7.1 — Custom domain (pre-deploy blocker)

There is **no production domain yet** — it will be chosen after the application features are built. Until then:

- `SITE.url` stays as the placeholder (`https://stezora-publisher.workers.dev`).
- This is a **documented blocker**, not a hidden assumption: before real production traffic, choose the domain, set `SITE.url` in `src/lib/seo/config.ts`, attach the custom domain in the Cloudflare dashboard (or `wrangler`), and verify canonical URLs, sitemap, RSS, and Open Graph use the production origin (§84). `BETTER_AUTH_URL`/`trustedOrigins` are updated to the production origin.
- Never ship `workers.dev` as the canonical origin once a custom domain exists.

### M7.2 — Manual deployment (fallback)

**Goal:** a documented manual path used when CI is unavailable or failing.

**Files:** `docs/cloudflare.md`, `package.json` scripts.

**Steps (documented commands):**
1. From a dev machine with wrangler auth:
   - `pnpm db:migrate:remote` (`wrangler d1 migrations apply stezora-app-db --remote`)
   - `pnpm db:seed:remote` and `pnpm db:backfill:remote`
   - `wrangler secret put BETTER_AUTH_SECRET` (and any other secrets, §46)
2. Build against the deployed content:
   - `EXPORT_CONTENT_URL=https://<domain>/api/content pnpm export:content`
   - `pnpm build`
   - `wrangler deploy`
3. Smoke test (see M7.5).

### M7.3 — GitHub Actions CI

**Goal:** production deployable from Git (DEVELOPER.md §69, §76).

**Files:** `.github/workflows/deploy.yml`.

**Steps:**
1. Trigger: push to `main`.
2. Job: checkout → setup Node 22 → `pnpm install` → `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm security:check` (M8) → build with remote export (`EXPORT_CONTENT_URL=<prod /api/content>` as a repo variable) → `wrangler d1 migrations apply --remote` → `wrangler deploy`.
3. Secrets in the repo: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
4. Bootstrap note (documented in the workflow comments / `docs/cloudflare.md`): the **first** production deploy requires one manual pass from a dev machine (create D1/R2, apply migrations, seed + backfill) so that a deployed `GET /api/content` exists before CI's first build.

**Acceptance:** pushing to `main` lints, typechecks, tests, security-checks, builds, and deploys; a failing test or security check stops the deploy.

### M7.4 — Secrets, env examples, docs

**Files:** `.env.example`, `.dev.vars.example`, `docs/cloudflare.md`, `README.md`.

**Steps:**
1. `.env.example` additions: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ADMIN_EMAIL`, `ADMIN_INITIAL_PASSWORD`, `EXPORT_CONTENT_URL` — placeholders only (§46). Remove the legacy `AUTH_SECRET` key.
2. `docs/cloudflare.md`: full binding + secret list, local vs remote D1/R2 commands, manual deploy runbook, CI bootstrap, deletion policy, session-revocation note (rotate `BETTER_AUTH_SECRET`), and the Drizzle migration workflow (`drizzle-kit generate` → `wrangler d1 migrations apply`).
3. `README.md`: update Development/Deployment sections to the two-path model (CI + manual fallback) and the `dev:worker` flow.

### M7.5 — Deployment checklist, smoke test, rollback

**Goal:** deterministic go/no-go (DEVELOPER.md §84).

```text
[ ] D1 migrations applied to production
[ ] Seed + backfill complete in production D1
[ ] Secrets set via `wrangler secret put` (BETTER_AUTH_SECRET, ...)
[ ] R2 bucket created and bound
[ ] `SITE.url` is the real custom domain (§84) — BLOCKED until M7.1
[ ] `BETTER_AUTH_URL` / `trustedOrigins` point at the production origin
[ ] `pnpm export:content` produced complete content
[ ] `pnpm build` passed
[ ] Smoke: /admin login, one published post page, canonical URL on the production domain
[ ] 404s and assets behave correctly behind the Worker
[ ] CI deploy passed (or manual deploy completed + diff reviewed)
[ ] Security checklist (M8) passed
```

Rollback: `wrangler rollback` to the previous release; document in `docs/cloudflare.md`.

---

## Milestone 8 — Security check & hardening

**Goal:** a deterministic pre-deploy security gate (go/no-go) that verifies the security requirements end to end before real production traffic (DEVELOPER.md §12, §13, §29, §38, §39, §40, §43, §44, §45, §46, §57, §63, §83, §84).

**Files:**
- `scripts/security/check.ts` — automated checks; npm script `"security:check"`.
- `docs/security.md` — policy + the full checklist.
- `tests/security.test.ts` (node pool) — static scans (secrets, palette utilities are covered in M5; here: no commit of `.env.*`/`.dev.vars`, no `.env` entries accidentally committed, `worker-configuration.d.ts` has no secret values).
- `tests/worker/headers.test.ts` (worker pool) — security headers on API/public responses.
- `.github/workflows/deploy.yml` (M7.3) — run `pnpm security:check` as a mandatory step.

**Steps (checklist, each item traced to a working test or a documented check):**
1. **Auth hardening (§12, §13, §45):** BetterAuth configured with a ≥ 32-byte `BETTER_AUTH_SECRET` (validated at boot); `trustedOrigins` is an explicit allowlist (localhost dev origins + production domain); session cookie is HttpOnly + Secure (prod) + SameSite, Path=/; CSRF rejected by BetterAuth's built-in protection; DB-backed rate limiting enabled.
2. **Authorization (§12, §13):** every `/api/admin/*` route goes through `requireAdmin`; role checked where needed; no admin route renders without auth (tested in `tests/worker/auth.test.ts`).
3. **Input validation (§44):** zod on every request body/param/query; media uploads validate size, MIME allowlist, extension, and server-generated key (§29) — tested in P4.6 + `tests/worker/media.test.ts`.
4. **Content safety (§83):** the sanitizer runs on **every** content write path (import, backfill, editor save, preview); a test inserts malicious markdown/HTML and asserts stripped output.
5. **Error/leak containment (§38, §43):** API envelope never returns stack traces or internal messages; unknown errors → generic `INTERNAL_ERROR`. Test asserts a thrown internal error produces no internal text or query string in the body/log.
6. **Logging (§39):** structured logs never contain `BETTER_AUTH_SECRET`, `ADMIN_*`, passwords, or tokens; query strings are never logged. Tests grep logs in the worker pool.
7. **Secrets (§46):** `scripts/security/check.ts` greps the git index for real secret patterns, confirms `.env.*`/`.dev.vars` are gitignored with `.env.example`/`.dev.vars.example` committed as placeholders only, and greps `worker-configuration.d.ts` for placeholder `00000000-...` D1 id (allowed) but no secret values.
8. **Dependencies (§40):** `pnpm audit --prod` run and recorded in `pnpm security:check`; any high/critical advisory blocks the gate.
9. **Headers:** API and media responses send `X-Content-Type-Options: nosniff`; production adds HSTS and a defensive `Content-Security-Policy` (no unsafe-inline for scripts except the documented inline theme bootstrap); tested in `tests/worker/headers.test.ts`.
10. **Draft isolation (§57):** `GET /api/content`, sitemap, RSS, and public pages exclude drafts/scheduled-future/archived (already enforced/tested in M2, M6 P4.4); sitemap/RSS only use published posts.
11. **Canonical origin (§59, §84):** no `workers.dev` in `SITE.url` for production builds; exporter refuses an empty/partial site (`EXPORT_CONTENT_ALLOW_EMPTY`).

**Acceptance criteria:**
```text
[ ] All automated security checks pass (Unit + Worker tests, `pnpm security:check`)
[ ] `docs/security.md` checklist fully ticked and smoke-tested against a staging deploy
[ ] No secret value, token, or internal error text in any response, log, or the repository
[ ] Security gate runs in CI before deploy (pull request / main)
```

### M8.0: Hardening shipped from the security audit (2026-10-30)

Parked here for traceability. A focused hardening pass landed on `feature-cms_and_cf_workers` (uncommitted at time of writing):

1. **Sign-in rate limit tightened** (`worker/lib/auth.ts`): the `/sign-in/*` rule went from `window 60 / max 30` to `window 60 / max 10` per IP. Caps brute force at 10/min/IP while staying well above what a human needs.
2. **Content-Security-Policy + HSTS**: enabled Astro's per-page CSP (`astro.config.mjs` `security.csp`), so `script-src`/`style-src` are locked to `'self'` plus per-page SHA-256 hashes with no `unsafe-inline`; added `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, scoped `img-src`/`connect-src`/`font-src`, and `Strict-Transport-Security` (2 years, `includeSubDomains`, no `preload`) in `public/_headers`. The 8 cosmetic inline `style="animation-delay…"` attributes on the homepage were moved to Tailwind classes so the output has zero inline style attributes.
3. **Constant-time backup-token compare** (`worker/routes/export.ts`): `/api/export` now compares the bearer token via SHA-256 digests in constant time instead of `===`.
4. **Auth origin pinning** (`worker/lib/auth.ts`, `worker/env.d.ts`): `baseURL` and `trustedOrigins` pin to `BETTER_AUTH_URL` when set, so auth trusts only the canonical domain (not the `*.workers.dev` host). Requires setting `BETTER_AUTH_URL` as a Worker var in production.

### M8.1: Two-factor authentication (TOTP), planned

**Goal:** add a second authentication factor to the single admin account, the standout weak link from the audit (the whole CMS sits behind one password). The tightened rate limit (M8.0) mitigates brute force; 2FA is the actual fix.

**Decision:** use **TOTP (authenticator app) with backup recovery codes**, not email/SMS OTP.
- **Rationale:** there is no email or SMS sender wired in the app (better-auth runs with `email_verified` disabled, no Resend/MailChannels/Cloudflare Email integration). TOTP needs no delivery infrastructure: a shared secret is established once via QR at enrollment and verified in the Worker against D1. It is also stronger than email OTP (no inbox-compromise path) and SMS OTP (no SIM-swap or phishing path).
- **Device-loss tradeoff:** solved by backup codes. better-auth 1.6.27's `twoFactor` plugin ships `totp`, `otp`, and `backup-codes` submodules, so recovery codes are generated at enrollment and stored offline. No dependency changes needed.

**Files (anticipated):**
- `worker/lib/auth.ts`: register the `twoFactor` plugin (TOTP + backup codes) on the better-auth instance.
- `migrations/00XX_two_factor.sql`: the plugin's `twoFactor` table (secret + backup codes), generated via `pnpm better-auth:generate` then `pnpm db:generate`.
- `src/pages/admin/security.astro` (or a panel in the dashboard): TOTP enrollment, showing the QR + secret, verifying a first code to activate, then revealing one-time backup codes.
- `src/pages/admin/login.astro`: add the second step so that after the password succeeds with 2FA enabled, the user is prompted for the TOTP (or a backup) code.
- `src/components/admin/*`: enrollment and verification UI (React island), using `better-auth/client` `twoFactorClient`.
- `tests/worker/auth.test.ts` (or a new `two-factor.test.ts`): enroll, verify, and assert sign-in is blocked without the second factor once enabled, and that backup-code consumption is single-use.

**Steps:**
1. Add the `twoFactor` server plugin (TOTP + backup codes) and regenerate the auth schema + migration; apply locally then remote.
2. Build the enrollment flow in the admin area (QR via the plugin's TOTP URI, verify-to-activate, display and acknowledge backup codes once).
3. Extend the login flow with the second-factor step (TOTP code or backup code), keeping the existing error-message parity so the step leaks nothing.
4. Keep 2FA opt-in per user so enabling the plugin cannot lock the owner out before enrollment; document the recovery path (backup codes) in `docs/security.md`.
5. Verify end to end in a browser on a branch before merging (enrollment, login, one backup-code sign-in), then run the full `pnpm lint && pnpm typecheck && pnpm test && pnpm build` gate.

**Acceptance criteria:**
```text
[ ] twoFactor (TOTP + backup codes) enabled on the better-auth instance; migration applied local + remote
[ ] Admin can enroll an authenticator via QR and must verify a code to activate
[ ] One-time backup codes are generated at enrollment, shown once, and each is single-use
[ ] With 2FA enabled, sign-in requires the second factor; password alone is rejected
[ ] Enrolling cannot lock the owner out (opt-in per user; recovery path documented)
[ ] Enrollment + login + backup-code sign-in smoke-tested in a browser before merge
```

---

## Definition of done (Phase 4 + Phase 5)

```text
[x] One Worker serves the static site, /admin shell, and /api/* (+ /api/auth/* via BetterAuth)
[x] D1 schema managed by Drizzle (`drizzle-kit generate` → wrangler apply) locally and in production; content backfilled into D1
[x] All DB access is Drizzle (`drizzle-orm/d1`); no raw `env.DB.prepare` in application code
[x] Auth is BetterAuth (email/password + DB-backed rate limit); `users`/`login_attempts` removed; `role` is an additional field
[x] All secrets read from bindings/.dev.vars, none committed; `AUTH_SECRET` renamed/replaced by `BETTER_AUTH_SECRET`
[x] API responses follow one format and never leak internals
[x] /api/content reproduces the site content at build time (prebuild) and includes `publications.accent`
[x] Auth works end to end (login/logout/me via BetterAuth, 401/302 everywhere required)
[x] Theme from COLORS.md applied: semantic tokens, light/dark rules, no default palette utilities in public markup
[x] Per-publication accents applied (dark-amaranth / bright-amber / soft-periwinkle) as data, accent-only override
[x] Dashboard lists post stats per publication
[x] Editor creates, edits, previews, and publishes posts
[x] Drafts never reach public pages, sitemap, RSS, or the export endpoint
[x] Categories and tags are manageable and export correctly
[x] Media upload validates server-side and stores to R2 + D1
[x] Sanitizer runs on every content write
[ ] Production deployable from Git (CI) with a documented manual fallback
[ ] Security gate (M8) passes and `docs/security.md` is current
[ ] Custom domain wired and canonical URLs verified (blocker M7.1, after domain is chosen)
[ ] Tests added, typecheck/lint/build pass
[ ] No secrets committed; docs updated
```

## References

- `DEVELOPER.md` — §9 Post Model, §10 Categories and Tags, §12 Authentication, §13 Authorization, §14 Editor, §22 Blogger Publishing, §24 D1 Database, §25 Database Constraints, §27 Cloudflare Workers, §28 R2, §29 Media Upload Security, §38 Error Handling, §39 Logging, §40 Dependency Policy, §41 Code Organization, §42 Repository Layer, §43 API Design, §44 Validation, §45 Security Requirements, §46 Secrets, §48 Required Validation, §57 Drafts, §62 Media UX, §63 Preview, §64 Accessibility, §66 Dark Mode, §69 Deployment, §72 Documentation, §76 Deployment Safety, §81 Content Storage and Build Reproducibility, §82 Post Slug and Public URL Rules, §83 Content Sanitization Boundary, §84 Production Site URL.
- `COLORS.md` — the six oklch ramps and the light/dark mode rules consumed by M5.
- `ARCHITECTURE.md` — high-level architecture and schema intent.
- `AGENTS.md` — agent rules and command reference.

---

# Phase 6 — Backup architecture & Blogger integration (planned 2026-10-28)

The next phases after the CMS: protect the data, then make Blogger a
first-class import/export peer. Sequencing: backups first (they protect
against integration bugs), then image localization, then mirror publishing.

## 6A. Backup architecture (DONE)

Three layers; see `docs/BACKUP.md` for the runbook and restore drill.

- [x] `GET /api/export`: full-fidelity content export (drafts, markdown, media
      and blogger_sync rows), authed by admin session or `BACKUP_TOKEN` bearer.
- [x] `scripts/backup/`: `export-all.ts` (per-post JSON + table files, local
      Miniflare or live URL), `dump-d1.ts` (SQL dump), `sync-media.sh` (rclone
      R2 mirror); `backup:content` / `backup:db` / `backup:media` scripts.
- [x] `.github/workflows/backup.yml`: nightly content snapshot committed to a
      private backup repo; Sunday SQL dump and media mirror.
- [x] `docs/BACKUP.md` with the restore drill; `migration-reports/` tracked.
- [ ] Activation (owner): `wrangler secret put BACKUP_TOKEN`, create the
      private backup repo, add the workflow secrets.

## 6B. Blogger import hardening

- [x] Content fidelity: HTML-to-markdown on backfill (turndown), Blogger
      line-div handling, image unwrap/strip, excerpts left for manual
      authoring, lead image recorded as featured.
- [x] Media segregation: every embedded image becomes a media row keyed by
      `(post_id, source_url)`.
- [x] Image localization: `POST /api/admin/media/:id/localize` downloads the
      external image into R2 (`localized/<media-id>.<ext>`, w1600 variant for
      Blogger URLs), fixes mime/size, and rewrites the owning post's content
      and markdown to `/media/<key>`. Driven by `pnpm blogger:localize`
      (signs in as admin, loops external rows). Ran locally: 56/56.
- [ ] Run localization against production after deploy (same endpoint; the
      driver needs a remote-URL mode or a one-off curl loop).
- [ ] Incremental re-import: per-publication high-water mark so routine
      re-imports only touch changed posts; import guard refusing publications
      already in Phase 2 (CMS-as-source) without `--force`.

## 6C. Blogger mirror publishing (CMS -> Blogger)

Design principle: mirroring never blocks or fails a save on our site.

- [ ] Move `BloggerClient` where the Worker can import it; add `getPost`,
      `insertPost`, `updatePost`, `publishPost`, `revertPost`.
- [ ] Worker secrets: `BLOGGER_CLIENT_ID`, `BLOGGER_CLIENT_SECRET`,
      `BLOGGER_REFRESH_TOKEN` (minted by `pnpm blogger:oauth`).
- [ ] `worker/services/blogger-sync.ts` driven by the `blogger_sync` table:
      on publish/update of a post whose publication has `blogger_blog_id`,
      upsert a pending row and sync in `ctx.waitUntil`; insert vs update keyed
      by `blogger_post_id`; unpublish calls revert, never delete.
- [ ] Compile to Blogger format: rendered HTML + `wrapImagesForBlogger()`
      around the featured image (the inverse of the import unwrap), plus an
      "Originally published at <canonical>" footer.
- [ ] Retry: `POST /api/admin/posts/:id/blogger-sync` and a sync status
      indicator in the admin posts list.
- [ ] Loop prevention: stop importing publications that have locally authored
      synced posts.

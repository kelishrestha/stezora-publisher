# Project Agent Rules

## Architecture

This is a personal multi-publication publishing platform.

The system contains exactly three first-class publications,
but the data model must support additional publications.

The most important architectural decision is:

> **One CMS, three publications, one website.**

Do not build three separate applications.

Do not make Blogger the permanent backend.

Do not make the public website dependent on runtime Blogger API calls.

Instead:

```text
                    ONE CMS
                       │
          ┌────────────┼────────────┐
          │            │            │
          ▼            ▼            ▼
     Publication A Publication B Publication C
          │            │            │
          └────────────┼────────────┘
                       ▼
                    Astro
                       │
                       ▼
                 Cloudflare
```

This gives you a platform that starts as a personal publishing site but can later grow into a lightweight, private Blogger/Medium-style publishing system entirely under your control.

### Frontend

Use Astro for public pages.

Use React only for interactive components that genuinely
need client-side state.

Do not turn the entire site into a client-side SPA.

### Backend

Use Cloudflare Workers.

Use D1 for relational persistent data.

Use R2 for uploaded media.

### Project structure

```text
stezora-publisher/
│
├── src/
│   ├── components/
│   │   ├── blog/
│   │   ├── publication/
│   │   ├── navigation/
│   │   └── ui/
│   │
│   ├── layouts/
│   │   ├── BaseLayout.astro
│   │   ├── BlogLayout.astro
│   │   └── PublicationLayout.astro
│   │
│   ├── pages/
│   │   ├── index.astro
│   │   ├── about.astro
│   │   ├── publications/
│   │   └── admin/
│   │
│   ├── content/
│   │   └── blog/
│   │
│   └── lib/
│       ├── blogger/
│       ├── seo/
│       ├── publications/
│       └── analytics/
│
├── worker/
│   ├── routes/
│   ├── services/
│   ├── db/
│   └── index.ts
│
├── scripts/
│   └── blogger/
│
├── migrations/
│
├── public/
│
├── tests/
│
├── AGENTS.md
├── ARCHITECTURE.md
├── package.json
└── README.md
```

---

#### Database model

Initial D1 schema:

```text
users
├── id
├── email
├── password_hash / auth reference
├── role
└── created_at

publications
├── id
├── name
├── slug
├── description
├── blogger_blog_id
├── blogger_url
└── created_at

posts
├── id
├── publication_id
├── title
├── slug
├── excerpt
├── content
├── status
├── published_at
├── updated_at
├── canonical_url
├── blogger_post_id
└── created_at

categories
├── id
├── publication_id
├── name
└── slug

tags
├── id
├── name
└── slug

post_tags
├── post_id
└── tag_id

media
├── id
├── post_id
├── r2_key
├── filename
├── mime_type
└── created_at

blogger_sync
├── id
├── post_id
├── blogger_blog_id
├── blogger_post_id
├── status
├── last_synced_at
└── error
```

Do not over-design the schema before the first implementation.

Note: `publications.blogger_blog_id` and `publications.blogger_url` are D1 columns for Blogger synchronization. They do NOT belong on the frontend `Publication` domain model; Blogger integration config is read from environment variables via `src/lib/blogger/config.ts`.

---

## Content

Every post belongs to exactly one publication.

Never duplicate post records simply because a post is
published to Blogger.

## Blogger

Blogger is an external publishing integration.

The internal post is the source of truth.

Store Blogger IDs for synchronization.

## SEO

Every public article must have:

- canonical URL
- title
- description
- Open Graph metadata
- publication date
- updated date
- structured data

## Testing

After every significant implementation:

1. Run type checking.
2. Run tests.
3. Run production build.
4. Review git diff.
5. Do not leave debugging code.

Run:

```
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Security

Never commit secrets.

Never expose Blogger credentials.

Never expose Cloudflare API tokens.

Use environment variables/secrets.

## Code quality

Prefer small, composable modules.

Do not introduce a dependency when native Astro,
Cloudflare or TypeScript functionality is sufficient.

Do not rewrite working code unnecessarily.

# Cloudflare deployment

Recommended:

```text
GitHub
   │
   ▼
Cloudflare
   │
   ├── Astro deployment
   ├── Workers
   ├── D1
   ├── R2
   └── Web Analytics
```

Keep development local:

```text
pnpm dev
```

Then use Cloudflare's local tooling for:

```text
D1
Workers
R2
```

The production deployment should be reproducible from Git.

---

# Implementation phases

## Phase 1 — Foundation

- Astro
- TypeScript
- Tailwind
- Cloudflare deployment
- Base layout
- Responsive design
- Dark mode
- SEO
- RSS
- Sitemap

## Phase 2 — Publications

- Publication model
- Three publication pages
- Publication navigation
- Categories
- Tags
- Article pages

## Phase 3 — Blogger migration

- Blogger API integration
- Import command
- HTML transformation
- Image handling
- Duplicate detection
- URL mapping
- Migration reports

## Phase 4 — CMS

- Authentication
- Dashboard
- Editor
- Drafts
- Publishing
- Media
- Categories
- Tags

## Phase 5 — Cloudflare backend

- Workers
- D1
- R2
- API
- Secrets
- Production configuration

## Phase 6 — Blogger synchronization

- Publish to Blogger
- Update Blogger post
- Retry failed sync
- Sync status
- Per-publication Blogger settings

## Phase 7 — Analytics

- Cloudflare Web Analytics
- Admin analytics
- Publication comparisons
- Popular posts
- Traffic sources

## Phase 8 — Audience

- Newsletter
- Subscribers
- RSS
- Optional comments
- Reader accounts only if needed

---

# Recommended Git workflow

Use small feature branches.

```text
main
 │
 ├── feature/astro-foundation
 ├── feature/publications
 ├── feature/blogger-import
 ├── feature/cms
 ├── feature/d1
 ├── feature/r2
 ├── feature/analytics
 └── feature/blogger-sync
```

## Guidelines

- Read ARCHITECTURE.md for project architecture.
- Work on one feature at a time.
- Do not allow simultaneously redesign the entire application and implement five unrelated features.

---

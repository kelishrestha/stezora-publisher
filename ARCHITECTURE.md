# Architecture

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

## Frontend

Use Astro for public pages.

Use React only for interactive components that genuinely
need client-side state.

Do not turn the entire site into a client-side SPA.

## Backend

Use Cloudflare Workers.

Use D1 for relational persistent data.

Use R2 for uploaded media.

## Project structure

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

## Database model

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

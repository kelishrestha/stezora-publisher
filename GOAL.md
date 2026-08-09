# Personal Multi-Publication Blog Platform — Architecture & Agentic Coding Tool Recommendation

## 1. Project goal

Build a personal publishing platform that:

- Replaces the dependency on Blogger over time.
- Imports existing content from three Blogger publishing sites.
- Presents the three publications under separate headings/sections.
- Lets the owner write and publish from one place.
- Optionally mirrors new posts back to Blogger during migration.
- Runs primarily on Cloudflare's free/low-cost infrastructure.
- Provides better privacy-conscious analytics than Blogger.
- Keeps the architecture simple enough for one developer to maintain.
- Preserves SEO, canonical URLs, RSS, sitemap, metadata, and existing content history.

The three existing Blogger sites should be treated as **three publications**, not as three separate applications.

Example:

```text
Personal Publishing Site
│
├── Publication A
│   ├── Posts
│   ├── Categories
│   └── Tags
│
├── Publication B
│   ├── Posts
│   ├── Categories
│   └── Tags
│
└── Publication C
    ├── Posts
    ├── Categories
    └── Tags
```

The visitor should experience one website, while the content remains clearly separated.

---

# 2. Recommended technology stack

## Primary recommendation

| Layer              | Technology                          |
| ------------------ | ----------------------------------- |
| Frontend           | Astro + TypeScript                  |
| Styling            | Tailwind CSS                        |
| Interactive UI     | React islands where needed          |
| Content model      | Astro Content Collections initially |
| CMS/backend        | Cloudflare Workers                  |
| Database           | Cloudflare D1                       |
| File/image storage | Cloudflare R2                       |
| Hosting/CDN        | Cloudflare                          |
| Analytics          | Cloudflare Web Analytics initially  |
| Search             | Pagefind initially                  |
| Existing content   | Blogger API                         |
| Authentication     | Admin-only authentication           |
| Source control     | GitHub                              |
| Deployment         | Cloudflare                          |
| Email/newsletter   | Add later                           |

## Why Astro

This is primarily a publishing application, not a highly interactive SaaS application.

Astro is well suited to:

- SEO-heavy pages
- Blogs
- Documentation
- Articles
- Static/mostly-static pages
- Excellent page performance
- Markdown/MDX
- Content collections
- Selective React components

The public website should remain mostly static and CDN-delivered.

The CMS/admin area can use interactive React components only where they are useful.

---

# 3. Recommended final architecture

```text
                         OWNER
                           │
                           ▼
                 ┌──────────────────┐
                 │   Personal CMS   │
                 │                  │
                 │ Post editor      │
                 │ Drafts           │
                 │ Publishing       │
                 │ Media            │
                 │ Categories       │
                 │ Tags             │
                 │ Analytics        │
                 └────────┬─────────┘
                          │
                ┌─────────┼─────────┐
                │         │         │
                ▼         ▼         ▼
               D1        R2      Blogger API
             database   media     migration/
                                  optional mirror
                │
                ▼
             Astro
                │
                ▼
       Cloudflare CDN/Pages
                │
                ▼
             READERS
                │
        ┌───────┴────────┐
        ▼                ▼
   Web Analytics     Subscribers
```

The key design principle is:

> Your CMS becomes the source of truth. Blogger becomes an import/migration source and optionally a temporary publishing mirror.

---

# 4. Three Blogger sites → three publications

Do not create three separate websites.

Use a single publication model.

Example:

```text
Publication
├── id
├── name
├── slug
├── description
├── logo
├── theme settings
├── blogger_blog_id
└── blogger_url
```

Then:

```text
Post
├── id
├── publication_id
├── title
├── slug
├── excerpt
├── content
├── status
├── published_at
├── updated_at
├── featured_image
├── canonical_url
└── blogger_post_id
```

This means the database can contain:

```text
Publication A
    ├── Post 1
    ├── Post 2
    └── Post 3

Publication B
    ├── Post 4
    ├── Post 5
    └── Post 6

Publication C
    ├── Post 7
    ├── Post 8
    └── Post 9
```

---

# 5. Suggested public URL structure

Use publication-specific URLs.

Recommended:

```text
/
├── /publication-a
│   ├── /publication-a/post-one
│   ├── /publication-a/post-two
│   └── /publication-a/category/technology
│
├── /publication-b
│   ├── /publication-b/post-one
│   └── /publication-b/post-two
│
└── /publication-c
    ├── /publication-c/post-one
    └── /publication-c/post-two
```

Alternatively, if the publications already have strong brand identities:

```text
/blog
/poetry
/essays
```

Use names that make sense to readers rather than exposing technical IDs.

---

# 6. Home page

The homepage should introduce the overall publishing identity.

Suggested structure:

```text
--------------------------------------------------
Your Name / Publishing Brand
Short introduction
--------------------------------------------------

Publication A
Description
Latest posts
[View publication]

Publication B
Description
Latest posts
[View publication]

Publication C
Description
Latest posts
[View publication]

--------------------------------------------------
Latest writing across all publications
--------------------------------------------------

About
Projects
Contact
Subscribe
```

This makes the three Blogger sites feel like one coherent publishing platform.

---

# 7. Navigation

Recommended navigation:

```text
Home
Publications
    Publication A
    Publication B
    Publication C
About
Projects
Now
Search
Subscribe
```

On each publication page:

```text
Publication A
├── Home
├── Articles
├── Categories
├── Tags
└── About this publication
```

---

# 8. Blogger migration

Do not manually copy posts.

Build a migration utility.

```text
Blogger API
     │
     ▼
Fetch posts
     │
     ├── title
     ├── content
     ├── labels
     ├── published date
     ├── updated date
     ├── author
     ├── URL
     └── images
     │
     ▼
Transform
     │
     ▼
Your Post model
     │
     ▼
D1 / content files
```

Run this separately for each Blogger site.

Example:

```bash
pnpm blogger:import --blog publication-a
pnpm blogger:import --blog publication-b
pnpm blogger:import --blog publication-c
```

The migration should be **idempotent**.

Running it twice should update existing posts rather than creating duplicates.

---

# 9. Preserve Blogger identifiers

Every imported post should retain:

```text
blogger_blog_id
blogger_post_id
blogger_url
original_published_at
```

This gives you a migration trail.

Example:

```json
{
  "publication": "publication-a",
  "bloggerPostId": "123456789",
  "bloggerUrl": "https://example.blogspot.com/2022/01/example.html",
  "newUrl": "https://yourdomain.com/publication-a/example"
}
```

---

# 10. SEO migration

This is one of the most important parts.

For every migrated post:

- Preserve title.
- Preserve publication date.
- Preserve updated date.
- Preserve original content.
- Preserve important images.
- Preserve meaningful slugs where possible.
- Add canonical URLs.
- Generate sitemap.
- Generate RSS feeds.
- Add Open Graph metadata.
- Add Twitter/X metadata.
- Add Article structured data.
- Add breadcrumbs.
- Preserve internal links.
- Create redirects where possible.

Do not launch the new site and immediately remove the Blogger sites.

Run both systems during migration.

---

# 11. Publishing workflow

The desired workflow is:

```text
Write article
     │
     ▼
Select publication
     │
     ├── Publication A
     ├── Publication B
     └── Publication C
     │
     ▼
Add category/tags
     │
     ▼
Save draft
     │
     ▼
Preview
     │
     ▼
Publish
     │
     ├───────────────┐
     ▼               ▼
Your website      Blogger
canonical         optional mirror
```

The important rule:

> Never require the owner to write the same article twice.

---

# 12. Blogger publishing strategy

Use three phases.

## Phase 1 — Blogger is the source

```text
Blogger
   ↓
Import
   ↓
New website
```

Use this to migrate historical content.

## Phase 2 — Your CMS is the source

```text
Your CMS
   ├──→ New website
   └──→ Blogger
```

Blogger becomes a secondary publishing destination.

## Phase 3 — Your site is the only source

```text
Your CMS
    ↓
Your website
```

Blogger can eventually be retired or kept as an archive/redirect target.

---

# 13. Analytics

Do not design analytics around secretly identifying visitors.

Instead, separate visitors into two categories.

## Anonymous visitors

Track useful aggregate information such as:

- Page views
- Sessions
- Approximate geography
- Device
- Browser
- Referrer
- Entry page
- Exit page
- Popular articles
- Returning visitors
- Traffic sources

## Known readers

Only identify a reader when they voluntarily provide information, such as by:

- Subscribing to a newsletter
- Creating an account
- Leaving a comment
- Contacting you

This is both more useful and more privacy-conscious.

---

# 14. Analytics architecture

Initial version:

```text
Visitor
   │
   ▼
Cloudflare
   │
   ├── Website
   └── Web Analytics
```

Later, if custom analytics are required:

```text
Visitor
   │
   ▼
Analytics endpoint
   │
   ▼
Cloudflare Worker
   │
   ▼
D1
   │
   ▼
Admin Analytics Dashboard
```

Do not store raw IP addresses unless there is a clear, justified requirement.

Prefer aggregated or privacy-preserving analytics.

---

# 15. Newsletter / reader relationship

A newsletter can be more valuable than trying to identify every visitor.

Add:

```text
Enjoyed this article?

Subscribe to receive new publications.

[ Email address ]

[ Subscribe ]
```

Eventually measure:

```text
Visitors
   ↓
Returning visitors
   ↓
Subscribers
   ↓
Engaged readers
```

This provides a useful audience funnel without needing invasive tracking.

---

# 16. Admin dashboard

Recommended routes:

```text
/admin
/admin/posts
/admin/posts/new
/admin/posts/:id
/admin/posts/:id/edit
/admin/drafts
/admin/media
/admin/publications
/admin/categories
/admin/tags
/admin/analytics
/admin/subscribers
/admin/settings
```

Dashboard:

```text
--------------------------------------------------
Dashboard
--------------------------------------------------

Posts                  128
Drafts                   4
Publications             3
Subscribers            342
Views this month     12,431

--------------------------------------------------

Recent posts

Title                 Publication       Status
--------------------------------------------------
Article A             Publication A     Published
Article B             Publication B     Draft
Article C             Publication C     Published

--------------------------------------------------

Analytics

Popular posts
Traffic sources
Top publications
Subscriber growth
--------------------------------------------------
```

---

# 17. Editor

Start with Markdown/MDX internally.

The editor can provide:

- Title
- Slug
- Publication
- Content
- Excerpt
- Featured image
- Category
- Tags
- SEO title
- SEO description
- Publish date
- Draft/published status
- Preview

Do not build a huge WordPress-style editor initially.

A Markdown-first system is easier to maintain.

---

# 18. Media storage

Use Cloudflare R2 for:

- Featured images
- Article images
- Author images
- Publication logos
- Downloadable files

Recommended structure:

```text
r2/
├── publications/
│   ├── publication-a/
│   ├── publication-b/
│   └── publication-c/
│
├── posts/
│   ├── 2026/
│   └── 2025/
│
└── authors/
```

---

# 19. Search

Do not build database search initially.

Use Pagefind for the public website.

Build-time search:

```text
Astro
  ↓
Generate pages
  ↓
Pagefind index
  ↓
Browser search
```

This is simple and inexpensive.

Move to database-backed search only if the number of articles becomes large enough to justify it.

---

# Development workflow

Use the agent in stages.

## Stage A — Planning

Do not initially tell the agent:

> Build my whole website.

Instead:

```text
Analyze this repository and create an implementation plan
for a personal multi-publication publishing platform.

Requirements:
- Astro
- TypeScript
- Cloudflare
- Three publications
- Blogger migration
- D1
- R2
- Admin CMS
- Analytics
- SEO
- RSS
- Search

Do not modify files.
Create ARCHITECTURE.md and explain the proposed implementation.
```

Review the architecture first.

---

## Stage B — Scaffold

Then:

```text
Implement Phase 1 only.

Create the Astro application structure,TypeScript configuration,Tailwind configuration,publication model,content model,layouts,navigation,homepage,publication pages,article pages,SEO metadata,RSS and sitemap.

Do not implement authentication, Blogger API,
analytics or D1 yet.

Run type checking and build after implementation.
```

This prevents the agent from creating too much at once.

---

## Stage C — Blogger migration

Next:

```text
Implement Blogger migration.

Create a reusable migration command that can import
three Blogger blogs independently.

The migration must be idempotent.

Preserve:
- Blogger blog ID
- Blogger post ID
- title
- slug
- publication date
- update date
- labels
- HTML content
- original URL
- image URLs

Do not modify existing imported content without
explicit matching by Blogger post ID.

Add tests for duplicate imports.
```

---

## Stage D — CMS

Then:

```text
Implement the admin CMS.

Requirements:
- authentication
- publication selector
- post editor
- drafts
- publishing
- categories
- tags
- media
- preview
- SEO fields

Use D1 for persistent data and R2 for media.

Do not implement Blogger publishing yet.
```

---

## Stage E — Blogger publishing

Then:

```text
Implement Blogger publishing as a secondary destination.

When a post is published:
1. Publish to our own website.
2. If Blogger publishing is enabled for the publication,
   publish/update the corresponding Blogger post.
3. Store blogger_post_id.
4. Never create duplicate Blogger posts.
5. Log publishing failures.
6. Allow retrying failed Blogger synchronization.
```

---

## Stage F — Analytics

Then:

```text
Implement privacy-conscious analytics.

Start with Cloudflare Web Analytics integration.

Do not collect personally identifying information.

Create an admin analytics page for:
- page views
- popular posts
- publication performance
- referrers
- approximate geography
- devices
- traffic trends
```

---

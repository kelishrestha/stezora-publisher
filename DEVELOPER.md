# Developer Agent — Personal Multi-Publication Publishing Platform

## 1. Role

You are the **Developer Agent** for a personal multi-publication publishing platform.

Your responsibility is to design, implement, test, debug, and maintain the application according to the project's architecture.

The application consolidates three existing Blogger publishing sites into a single publishing platform.

You must prioritize:

1. Correctness
2. Security
3. Simplicity
4. Maintainability
5. SEO
6. Performance
7. Cloudflare compatibility
8. Testability

Do not introduce unnecessary complexity.

---

# 2. Product Context

The application is a personal publishing platform containing three publications.

```text
Personal Publishing Platform
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

The owner must be able to manage all publications from one CMS.

The owner should write a post once and select which publication it belongs to.

The platform must eventually support:

- Blogger migration
- Blogger synchronization
- Drafts
- Publishing
- Categories
- Tags
- Media
- Search
- SEO
- Analytics
- Subscriber management
- Admin authentication
- Cloudflare deployment

---

# 3. Core Architecture

The preferred architecture is:

```text
                         OWNER
                           │
                           ▼
                    Personal CMS
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
             D1           R2       Blogger API
          Database       Media     Import/Sync
              │
              ▼
            Astro
              │
              ▼
       Cloudflare CDN
              │
              ▼
           Readers
```

Technology choices:

| Layer            | Technology                    |
| ---------------- | ----------------------------- |
| Public website   | Astro                         |
| Language         | TypeScript                    |
| Styling          | Tailwind CSS                  |
| Interactive UI   | React islands where necessary |
| Backend          | Cloudflare Workers            |
| Database         | Cloudflare D1                 |
| Object storage   | Cloudflare R2                 |
| Hosting          | Cloudflare                    |
| Analytics        | Cloudflare Web Analytics      |
| Search           | Pagefind initially            |
| Existing content | Blogger API                   |
| Source control   | GitHub                        |

Do not replace these technologies without a concrete technical reason.

---

# 4. Architecture Principles

## 4.1 One application

There must be one application.

Never create separate applications for the three publications.

Use:

```text
Publication
```

as a domain entity.

---

## 4.2 Three publications are data, not applications

Bad:

```text
publication-a/
publication-b/
publication-c/
```

Good:

```text
publications
```

with records such as:

```text
id
name
slug
description
```

---

# 5. Source of Truth

The internal publishing platform is the source of truth.

Blogger is an external integration.

The desired relationship is:

```text
Your CMS
    │
    ├──→ Your website
    │
    └──→ Blogger
```

Never make:

```text
Blogger
   ↓
runtime API
   ↓
public website
```

the primary architecture.

The public website must continue working if Blogger is unavailable.

---

# 6. Public Website

Use Astro for public pages.

Prefer static generation wherever practical.

Public pages should not require unnecessary client-side JavaScript.

Prefer:

```text
Astro
  ↓
HTML
  ↓
Cloudflare CDN
```

over:

```text
Browser
  ↓
React application
  ↓
API
  ↓
HTML
```

Use React only for interactive components.

Examples:

- search UI
- CMS editor
- analytics dashboard
- interactive forms
- media manager

---

# 7. URL Structure

Use publication-aware URLs.

Recommended:

```text
/
```

```text
/publication-a
/publication-a/post-slug
/publication-a/category/category-slug
/publication-a/tag/tag-slug
```

```text
/publication-b
/publication-b/post-slug
/publication-b/category/category-slug
/publication-b/tag/tag-slug
```

```text
/publication-c
/publication-c/post-slug
/publication-c/category/category-slug
/publication-c/tag/tag-slug
```

URLs must be:

- lowercase
- readable
- stable
- SEO-friendly
- deterministic

Avoid exposing database IDs in public URLs.

---

# 8. Publication Model

A publication should contain:

```ts
interface Publication {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  createdAt: string;
  updatedAt: string;
}
```

Blogger integration data (blog ID and blog URL) is **not** part of the `Publication` model. Resolve it per publication from environment variables via `src/lib/blogger/config.ts`:

```ts
bloggerBlogIdForPublication('the-sore-transition');
bloggerUrlForPublication('the-sore-transition');
```

The env keys derive from the slug: `BLOGGER_<SLUG_UPPER_SNAKE_CASE>_BLOG_ID` and `BLOGGER_<SLUG_UPPER_SNAKE_CASE>_BLOG_URL` (see `.env.example`). Never hard-code Blogger IDs or URLs in the public site code.

Rules:

- `bloggerBlogIdForPublication` is required and must be a numeric string; the resolver validates this and throws with the env key name otherwise.
- `bloggerUrlForPublication` is optional (returns `undefined` when unset) and normalizes the value to an absolute `https://` URL.

Do not hard-code publication-specific behavior into UI components.

Avoid:

```ts
if (publication === "publication-a") {
  ...
}
```

when the behavior can be represented by data/configuration.

---

# 9. Post Model

Every post belongs to exactly one publication.

Recommended fields:

```ts
interface Post {
  id: string;
  publicationId: string;
  title: string;
  slug: string;
  excerpt?: string;
  content: string;
  status: PostStatus;
  publishedAt?: string;
  updatedAt?: string;
  featuredImageId?: string;
  canonicalUrl?: string;
  createdAt: string;
}
```

Use a typed status:

```ts
type PostStatus = "draft" | "scheduled" | "published" | "archived";
```

Do not use arbitrary status strings throughout the application.

---

# 10. Categories and Tags

Categories belong to publications.

Tags may be shared across publications unless a concrete requirement says otherwise.

Recommended:

```text
Publication
   │
   └── Categories
```

and:

```text
Post
   │
   └── Tags
```

Do not duplicate tags unnecessarily.

---

# 11. Admin CMS

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

The public website and admin CMS should have clear boundaries.

---

# 12. Authentication

The public site does not require authentication.

The CMS requires authentication.

Never rely on UI hiding for security.

Bad:

```text
Hide Publish button
```

Good:

```text
Request
  ↓
Authenticate
  ↓
Authorize
  ↓
Perform operation
```

Every protected server operation must perform server-side authentication and authorization.

---

# 13. Authorization

Start with:

```text
admin
```

but design the authorization layer so additional roles can be added later.

Potential future roles:

```text
admin
editor
author
```

Do not implement authorization using hard-coded email addresses.

---

# 14. Editor

The editor should support:

- title
- content
- publication
- slug
- excerpt
- category
- tags
- featured image
- SEO title
- SEO description
- publish date
- draft/published status
- preview

Start with Markdown/MDX internally.

Do not build a complicated WordPress-style editor unless there is a real requirement.

---

# 15. Content Format

Prefer a normalized internal content representation.

Example:

```text
Post
├── title
├── excerpt
├── content
├── metadata
└── media references
```

External Blogger HTML must be normalized before entering the internal domain model.

Do not let Blogger-specific structures leak throughout the application.

---

# 16. Blogger Integration

Blogger is an external integration.

Create a dedicated integration layer.

Recommended structure:

```text
src/
└── lib/
    └── blogger/
        ├── client.ts
        ├── importer.ts
        ├── publisher.ts
        ├── mapper.ts
        └── types.ts
```

or equivalent architecture appropriate to the actual repository.

Do not put Blogger API calls directly into UI components.

---

# 17. Blogger Import

The migration must support three Blogger blogs.

The import process should be configurable.

Example:

```bash
pnpm blogger:import --blog publication-a
pnpm blogger:import --blog publication-b
pnpm blogger:import --blog publication-c
```

The exact command structure can differ, but the underlying importer must support multiple publications.

Per-publication Blogger blog IDs and blog URLs are configured with environment variables, not in the `Publication` model. `scripts/blogger/import.ts` resolves them via `src/lib/blogger/config.ts`:

```text
BLOGGER_THE_SORE_TRANSITION_BLOG_ID=...
BLOGGER_THE_SORE_TRANSITION_BLOG_URL=...
BLOGGER_THE_REBELLIOUS_FLAME_BLOG_ID=...
BLOGGER_THE_REBELLIOUS_FLAME_BLOG_URL=...
BLOGGER_MY_SOULFUL_INCANTATIONS_BLOG_ID=...
BLOGGER_MY_SOULFUL_INCANTATIONS_BLOG_URL=...
```

Keep these values in `.env.development` (real) and `.env.example` (placeholders).

`BLOGGER_<SLUG>_BLOG_ID` is required for import (numeric string). `BLOGGER_<SLUG>_BLOG_URL` is optional for import — it is only reported when present; its consumers are future redirect/canonical and sync logic.

---

# 18. Idempotent Migration

Blogger imports must be idempotent.

Running the importer twice must not create duplicate posts.

Use:

```text
blogger_blog_id
blogger_post_id
```

as external identifiers.

Before inserting an imported post:

```text
Does this Blogger post already exist?
        │
       YES ──→ Update/skip
        │
        NO
        │
        ▼
      Insert
```

Never match posts only by title.

---

# 19. Blogger Metadata

Preserve:

- Blogger blog ID
- Blogger post ID
- original URL
- title
- content
- publication date
- updated date
- labels
- author where appropriate
- image references

The imported record should retain enough information to trace it back to Blogger.

---

# 20. Blogger HTML

Treat imported Blogger HTML as external/untrusted content.

Do not blindly render arbitrary HTML.

Normalize/sanitize imported content as appropriate.

Pay particular attention to:

- scripts
- inline event handlers
- iframes
- unsafe URLs
- embedded HTML
- malformed markup

---

# 21. Blogger Images

Blogger image URLs may need migration to R2.

The migration should support:

```text
Blogger image
      ↓
Download
      ↓
Validate
      ↓
Upload to R2
      ↓
Replace reference
```

Do not assume all Blogger image URLs will remain available forever.

Preserve the original URL as migration metadata when useful.

---

# 22. Blogger Publishing

When Blogger publishing is implemented:

```text
CMS
 │
 ▼
Create/update internal post
 │
 ├──→ Publish website
 │
 └──→ Blogger sync
```

The internal website must succeed even if Blogger fails.

Example:

```text
Internal publish
       │
       ▼
Website published
       │
       ▼
Blogger synchronization
       │
       ├── success
       └── failure → retry
```

Do not roll back the internal post solely because Blogger is unavailable.

---

# 23. Blogger Sync Model

Use a synchronization record.

Example:

```text
blogger_sync
├── id
├── post_id
├── blogger_blog_id
├── blogger_post_id
├── status
├── last_synced_at
└── error
```

Possible states:

```text
pending
syncing
synced
failed
```

Provide retry behavior.

Do not silently discard synchronization failures.

---

# 24. D1 Database

Use D1 for relational persistent data.

Core tables:

```text
users
publications
posts
categories
tags
post_tags
media
blogger_sync
```

Future tables can include:

```text
subscribers
redirects
comments
analytics_events
```

only when required.

---

# 25. Database Constraints

Use database constraints rather than relying entirely on application code.

Examples:

```text
publications.slug UNIQUE
```

and appropriate uniqueness for:

```text
blogger_blog_id + blogger_post_id
```

Foreign keys should be used where appropriate.

Add indexes for common queries.

---

# 26. Database Migrations

Every schema change must be represented as a migration.

Never manually modify production D1 tables without a corresponding migration.

Migrations must:

- be ordered
- be reproducible
- be reviewed
- avoid accidental destructive operations
- be tested locally

Never drop production data casually.

---

# 27. Cloudflare Workers

Use Workers for dynamic/backend operations.

Examples:

```text
/auth
/api/posts
/api/publications
/api/media
/api/blogger
/api/analytics
```

Do not create an endpoint unless the operation genuinely needs server-side behavior.

---

# 28. R2

Use R2 for binary media.

Store metadata in D1.

Example:

```text
D1
├── media ID
├── filename
├── MIME type
├── size
└── R2 key

R2
└── actual file
```

Do not store large binary data directly in D1.

---

# 29. Media Upload Security

Validate uploads.

Check:

- file size
- MIME type
- extension
- dimensions for images
- generated storage key

Do not trust the original filename.

Do not construct R2 paths directly from untrusted user input.

Prevent path traversal.

---

# 30. SEO

Every article must have:

- title
- description
- canonical URL
- Open Graph metadata
- publication date
- updated date where appropriate
- Article structured data

Generate:

```text
/sitemap.xml
```

and RSS feeds.

Prefer publication-specific RSS:

```text
/publication-a/rss.xml
/publication-b/rss.xml
/publication-c/rss.xml
```

---

# 31. SEO Migration

When importing Blogger posts:

- preserve meaningful slugs
- preserve dates
- preserve canonical information
- create redirect mappings
- preserve internal links where possible

Do not intentionally create duplicate indexable pages.

If old Blogger URLs need to redirect, create an explicit redirect strategy.

---

# 32. Search

Start with Pagefind or equivalent static search.

Do not introduce a dedicated search database unless required.

Search should index:

- title
- excerpt
- article content
- publication
- tags
- categories

---

# 33. Analytics

Start with Cloudflare Web Analytics.

Analytics should be privacy-conscious.

Useful information includes:

- page views
- sessions
- referrers
- approximate geography
- devices
- browsers
- popular articles
- publication performance

Do not design the system around secretly identifying anonymous users.

Known readers can be identified only when they voluntarily provide information.

---

# 34. Newsletter

A subscriber system can be added later.

Potential model:

```text
subscribers
├── id
├── email
├── name
├── status
├── subscribed_at
└── unsubscribed_at
```

Do not build a newsletter system until the core publishing platform is stable.

---

# 35. Performance

Public pages should be extremely lightweight.

Prefer:

```text
HTML
CSS
minimal JavaScript
optimized images
CDN caching
```

Avoid unnecessary:

- React hydration
- client-side API requests
- third-party scripts
- huge dependencies
- large image files

Do not sacrifice performance for unnecessary interactivity.

---

# 36. TypeScript

Use strict TypeScript.

Avoid `any`.

Prefer:

```ts
unknown;
```

plus validation when handling external data.

Avoid excessive type assertions.

External APIs must be treated as untrusted.

---

# 37. External API Types

Separate external DTOs from internal domain models.

Preferred:

```text
Blogger API
    ↓
BloggerPostDTO
    ↓
validation
    ↓
Post domain model
```

Do not use Blogger API response types throughout the entire application.

---

# 38. Error Handling

Errors should be explicit.

Bad:

```text
Something went wrong.
```

Better:

```text
Blogger synchronization failed for post 123.
The remote service returned HTTP 403.
```

Never expose:

- access tokens
- passwords
- secrets
- stack traces
- database credentials

to users.

---

# 39. Logging

Use structured logs when practical.

Example:

```text
blogger_sync_failed
post_id=123
publication_id=2
blogger_post_id=456
status=403
```

Never log:

```text
password
access_token
refresh_token
AUTH_SECRET
```

---

# 40. Dependency Policy

Before adding a dependency, determine:

1. Why is it needed?
2. Can the existing stack solve the problem?
3. Is it maintained?
4. Is it compatible with Cloudflare?
5. What is its bundle impact?
6. Does it create a security concern?
7. Is its license acceptable?

Avoid dependency accumulation.

---

# 41. Code Organization

Keep business logic separate from UI.

Every configuration option exposed by a class, function, or module must be consumed.

Do not leave dead configuration.

Bad:

```text
config.baseUrl is accepted but the implementation hardcodes a default.
```

Good:

```text
Every exposed option is used or removed.
```

Prefer:

```text
components/
services/
repositories/
domain/
lib/
```

Examples:

```text
PostService
PublicationService
MediaService
BloggerService
BloggerImporter
BloggerPublisher
```

UI components should not contain large business workflows.

---

# 42. Repository Layer

Use repositories when they improve separation between database access and domain logic.

For example:

```ts
PostRepository;
PublicationRepository;
MediaRepository;
BloggerSyncRepository;
```

Do not introduce repositories merely for abstraction's sake.

The goal is testability and separation of concerns.

---

# 43. API Design

API endpoints should have consistent response formats.

Example:

```json
{
  "success": true,
  "data": {}
}
```

For errors:

```json
{
  "success": false,
  "error": {
    "code": "POST_NOT_FOUND",
    "message": "Post was not found."
  }
}
```

Do not expose internal exception messages.

Use appropriate HTTP status codes.

---

# 44. Validation

Validate all external input.

Validate:

- request body
- URL parameters
- query parameters
- uploaded files
- Blogger API responses
- authentication payloads

Do not assume client-side validation is sufficient.

Server-side validation is mandatory.

---

# 45. Security Requirements

The application must protect against:

- XSS
- CSRF
- SQL injection
- command injection
- SSRF
- path traversal
- unsafe file upload
- authentication bypass
- authorization bypass
- open redirects
- secret exposure
- unsafe HTML rendering

Imported Blogger content deserves special attention.

---

# 46. Secrets

Never commit secrets.

Examples:

```text
BLOGGER_CLIENT_SECRET
BLOGGER_REFRESH_TOKEN
AUTH_SECRET
CLOUDFLARE_API_TOKEN
```

Per-publication Blogger blog IDs and URLs (`BLOGGER_<SLUG>_BLOG_ID`, `BLOGGER_<SLUG>_BLOG_URL`) are not secrets, but they must still be read from environment variables via `src/lib/blogger/config.ts`. Do not hard-code them in `src/lib/publications`.

Use:

```text
.env.example
```

for documentation.

Commit `.env.example` to the repository. It must contain only safe placeholder values, never real secrets.

Use Cloudflare secrets/environment bindings in production.

---

# 47. Testing Requirements

Every feature should have appropriate tests.

At minimum:

### Unit tests

- slug generation
- publication assignment
- content transformation
- Blogger mapping
- sync status
- metadata generation

### Integration tests

- authentication
- authorization
- post creation
- post publishing
- Blogger import
- duplicate prevention
- Blogger synchronization
- media upload

---

# 48. Required Validation

Before declaring a feature complete, run the available project checks.

Prefer:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

If the project uses different commands, use the repository's actual scripts.

Never claim tests passed unless they actually ran.

---

# 49. Git Workflow

Work in small, reviewable changes.

Before making significant changes:

```bash
git status
```

After implementation:

```bash
git diff
git status
```

Do not modify unrelated files.

Do not silently rewrite large portions of the application.

Do not commit unless explicitly asked.

---

# 50. Agent Workflow

Before implementing a feature:

1. Read `AGENTS.md`.
2. Read `ARCHITECTURE.md`.
3. Inspect the repository.
4. Find existing related functionality.
5. Determine the smallest implementation.
6. Identify affected files.
7. Implement.
8. Run validation.
9. Review the diff.
10. Report what changed.

Do not immediately start writing code after receiving a large feature request.

Understand the existing architecture first.

---

# 51. Planning Rule

For medium or large tasks, create a short plan before implementation.

Example:

```text
Plan:

1. Add publication repository.
2. Add publication routes.
3. Add publication page layout.
4. Add publication navigation.
5. Add tests.
6. Run typecheck and build.
```

Then implement the plan.

Do not create a huge speculative architecture document for a small feature.

---

# 52. Existing Code First

Before creating a new utility, hook, service, component, or repository:

Search the repository.

Ask:

```text
Does this already exist?
```

Reuse existing functionality when appropriate.

Avoid duplicate implementations.

---

# 53. Don't Over-Engineer

This is a personal publishing application.

Do NOT introduce:

- microservices
- Kubernetes
- Redis without a demonstrated requirement
- message queues without a demonstrated requirement
- Elasticsearch without a demonstrated requirement
- GraphQL without a demonstrated requirement
- complex event sourcing
- CQRS without a demonstrated requirement
- multiple databases
- unnecessary background workers

Prefer the simplest architecture that satisfies the actual requirement.

---

# 54. Three-Publication Requirement

Every feature involving posts must correctly handle all three publications.

Test at least:

```text
Publication A
Publication B
Publication C
```

Do not implement publication-specific assumptions.

---

# 55. Publication Isolation

A post belonging to Publication A must not accidentally appear in:

```text
Publication B
Publication C
```

unless explicitly requested by a cross-publication feature.

Database queries must filter by publication where appropriate.

---

# 56. Cross-Publication Features

The homepage may intentionally aggregate content:

```text
Latest posts
   ├── Publication A
   ├── Publication B
   └── Publication C
```

This is different from publication-specific queries.

Be explicit about whether a query is:

```text
publication scoped
```

or:

```text
global
```

---

# 57. Drafts

Draft posts must not accidentally become publicly indexable.

Verify:

```text
draft
```

cannot be accessed through public article routes unless an authenticated preview mechanism explicitly allows it.

Drafts must not appear in:

- sitemap
- RSS
- search index
- public category pages
- public tag pages

---

# 58. Scheduled Posts

If scheduled publishing is implemented:

- validate timezone handling
- store timestamps consistently
- avoid publishing twice
- make scheduling idempotent
- handle failed publication attempts

Do not implement scheduling until the core publishing workflow is stable.

---

# 59. Canonical Content

Each post should have exactly one canonical public URL.

If the same article is mirrored to Blogger:

```text
Your website
     ↓
canonical
```

Blogger should not become the canonical source if your website is the primary platform.

---

# 60. Blogger URL Mapping

Maintain a redirect/mapping strategy:

```text
Old Blogger URL
       ↓
New URL
```

Potential model:

```text
redirects
├── old_path
├── new_path
├── status_code
└── created_at
```

Do not lose old URLs during migration.

The Blogger identifiers on each post record (`blogger_blog_id`, `blogger_post_id`, `blogger_url`) must be consumed by the public site, not merely stored.

For every imported post:

- the old Blogger URL must 301-redirect to the new public URL, or
- the old Blogger URL must remain the canonical URL until search engines re-crawl, or
- the redirect/canonical mapping must be explicitly documented and deferred as tracked work.

Storing Blogger metadata without any public URL handling is not a complete migration.

---

# 61. Admin UX

The CMS should prioritize the owner's workflow.

The primary flow should be:

```text
New Post
   ↓
Select publication
   ↓
Write
   ↓
Add metadata
   ↓
Preview
   ↓
Publish
```

Do not force the owner through unnecessary configuration.

---

# 62. Media UX

The owner should be able to:

- upload image
- select image
- reuse existing image
- view image metadata
- insert image into article

Avoid creating a complicated digital asset management system initially.

---

# 63. Preview

The editor should support previewing an article before publication.

Preview must render the same content pipeline used by production as closely as practical.

Avoid maintaining two unrelated rendering systems.

---

# 64. Accessibility

Public pages should follow accessibility best practices.

Ensure:

- semantic HTML
- keyboard navigation
- visible focus
- appropriate labels
- alt text
- sufficient contrast
- accessible forms
- heading hierarchy

Do not rely on color alone to communicate meaning.

---

# 65. Responsive Design

The website must work well on:

- mobile
- tablet
- desktop

Prioritize reading experience.

Articles should have:

- comfortable line length
- readable typography
- appropriate spacing
- responsive images
- accessible navigation

---

# 66. Dark Mode

Dark mode may be implemented as a UI feature.

Do not allow theme logic to leak into business/domain logic.

---

# 67. Content Migration Quality

After importing Blogger content, verify:

- titles
- formatting
- links
- images
- headings
- lists
- blockquotes
- dates
- tags
- publication assignment

Migration should produce a report.

Example:

```text
Publication A
-------------
Posts found:       152
Imported:          149
Skipped:             2
Failed:              1
Images migrated:   431

Failures:
- post 123: malformed HTML
```

---

# 68. Migration Safety

Never perform destructive migration automatically.

Do not:

```text
delete Blogger post
```

as part of import.

Import should be additive/update-oriented.

Destructive synchronization requires explicit approval.

---

# 69. Deployment

Production should be deployable from Git.

Recommended flow:

```text
GitHub
   ↓
Cloudflare
   ↓
Build
   ↓
Deploy
```

Production secrets must be configured separately from development.

A fresh checkout must produce a complete site.

The build must never depend on machine-local files that cannot be regenerated.

If content is stored outside Git (see section 81), the build must fetch/export it from D1 before compiling. An empty or partial site because content files were absent is a deployment failure.

Production `SITE.url` must be the real custom domain, never a development or `workers.dev` URL (see section 84).

---

# 70. Local Development

The project should be runnable locally with documented commands.

At minimum:

```bash
pnpm install
pnpm dev
```

Database/Cloudflare development should use local tooling where appropriate.

---

# 71. Environment Parity

Avoid code paths that behave completely differently in local and production environments.

Cloudflare-specific APIs should be tested locally using appropriate Cloudflare tooling.

---

# 72. Documentation

Maintain:

```text
README.md
AGENTS.md
ARCHITECTURE.md
```

Recommended documentation:

```text
docs/
├── blogger-migration.md
├── blogger-sync.md
├── cloudflare.md
├── database.md
├── deployment.md
├── analytics.md
└── security.md
```

Update documentation when architecture changes.

---

# 73. Agent Communication

When completing a task, report:

```text
## Implemented

- ...
- ...

## Files Changed

- ...
- ...

## Tests

- `pnpm lint` — PASS
- `pnpm typecheck` — PASS
- `pnpm test` — PASS
- `pnpm build` — PASS

## Notes

- ...

## Remaining Work

- ...
```

Never claim a command passed if it was not executed.

---

# 74. When Something Fails

Do not immediately change architecture.

First:

1. Read the error.
2. Identify the root cause.
3. Inspect related code.
4. Reproduce the problem.
5. Apply the smallest correction.
6. Run the relevant test again.

Do not mask errors by disabling:

- TypeScript checks
- ESLint rules
- tests
- security middleware
- build checks

---

# 75. When to Ask the User

Ask the user before proceeding when:

- a requirement is ambiguous and materially changes architecture
- a destructive migration is required
- production data may be modified
- Blogger content may be deleted
- credentials are required but unavailable
- two valid architectures have significantly different consequences
- an external paid service is required
- a new technology would replace an existing core technology

Do not ask unnecessary questions when a safe, conventional implementation is obvious.

---

# 76. Deployment Safety

Never deploy production automatically unless explicitly instructed.

Do not execute destructive Cloudflare commands without confirmation.

Before production deployment:

```text
Review
  ↓
Test
  ↓
Build
  ↓
Git diff
  ↓
User approval
  ↓
Deploy
```

---

# 77. Reviewer Integration

A separate `REVIEWER.md` exists for architectural/code review.

After completing a significant feature:

1. Run local tests.
2. Inspect the diff.
3. Request a review using `REVIEWER.md`.
4. Fix critical/high findings.
5. Re-run tests.

Do not modify `REVIEWER.md` to make a failing implementation pass review.

---

# 78. Definition of Done

A feature is complete only when:

```text
[ ] Requirement implemented
[ ] Existing architecture respected
[ ] Three-publication model preserved
[ ] Security reviewed
[ ] Input validation implemented
[ ] Tests added/updated
[ ] Typecheck passes
[ ] Lint passes
[ ] Build passes
[ ] Git diff reviewed
[ ] Documentation updated if necessary
[ ] No secrets committed
[ ] No unrelated files changed
```

---

# 79. Priority Order

When requirements conflict, prioritize:

```text
1. Security
2. Data integrity
3. Correctness
4. SEO
5. Performance
6. Maintainability
7. Developer convenience
8. Visual polish
```

Never sacrifice security or data integrity for convenience.

---

# 80. Final Development Principle

Build this platform as a **small, durable publishing system**, not as an enterprise SaaS platform.

The desired result is:

```text
             ONE PUBLISHING WORKFLOW
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
    Publication A Publication B Publication C
          │            │            │
          └────────────┼────────────┘
                       ▼
                    Astro
                       │
                       ▼
                  Cloudflare
                       │
                       ▼
                    Readers
```

The owner should be able to:

```text
Write once
   ↓
Choose publication
   ↓
Preview
   ↓
Publish
   ↓
Own the content
   ↓
Understand the audience
```

Keep the implementation simple enough that one developer can understand and maintain the entire system.

---

# 81. Content Storage and Build Reproducibility

Post content lives in D1 and is the single source of truth.

Post content is not committed to Git.

The public site is built statically from content exported from D1 at build time.

Approved pipeline:

```text
Blogger ──► import script ──► D1                          (source of truth)
                                      │
D1 ──► build-time export ──► gitignored JSON ──► Astro static build ──► CDN
```

Rules:

1. Do not commit post content JSON to Git.

2. JSON files under `src/content/posts/` are build artifacts. They must be fully reproducible from D1 at any time.

3. A fresh clone plus the content export must build the complete site. Never rely on content that exists only on one machine.

4. Keep a second copy of content until D1 is seeded. Options:

   - commit the JSON temporarily, or
   - seed D1 immediately from the existing files.

   Do not leave migrated content stored only in gitignored files.

5. The Blogger import must upsert into D1, keyed on `(blogger_blog_id, blogger_post_id)` with a UNIQUE constraint, so re-import stays idempotent without matching by title.

6. The Worker must expose a read-only endpoint (for example `GET /api/content`) that returns all published post data for the build-time export.

7. The build-time export script runs before `pnpm build` (for example as a `prebuild` step) and regenerates the gitignored JSON files in the same shape the content loader expects.

8. Keep public pages static. The export runs at build time; the runtime site remains "Request → CDN → HTML".

---

# 82. Post Slug and Public URL Rules

A post slug must not duplicate the publication slug.

Bad:

```text
/publications/the-sore-transition/posts/the-sore-transition-my-post
```

Good:

```text
/publications/the-sore-transition/posts/my-post
```

Rules:

1. Store a `slug` on the post record independently of the content filename.

2. Derive the public post path from `(publication.slug, post.slug)`, never from the filename.

3. Keep slugs stable across re-imports. For a known `blogger_post_id`, preserve the existing slug.

4. URLs must remain lowercase, readable, stable, and SEO-friendly.

---

# 83. Content Sanitization Boundary

Imported Blogger HTML is untrusted.

Sanitization must happen at the storage boundary — every time content is written to D1 — not only during the original import.

Rules:

1. Re-run the content sanitizer on every write path: import, edit, CMS save.

2. Never assume that content stored earlier is still safe because it was sanitized once.

3. The public render path may render stored HTML directly only because storage guarantees sanitized content on every write.

4. Add tests that exercise editing/re-writing a post and verify the stored content remains sanitized.

---

# 84. Production Site URL

`SITE.url` in `src/lib/seo/config.ts` feeds canonical URLs, the sitemap, Open Graph metadata, and RSS feeds.

Rules:

1. `SITE.url` must be the real production custom domain before deployment.

2. A `workers.dev` or localhost URL must never ship as the canonical origin.

3. Verify canonical URLs, sitemap, and RSS in the deployment checklist use the production domain.

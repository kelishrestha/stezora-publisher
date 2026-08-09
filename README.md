# Stezora Publisher

A personal multi-publication publishing platform.

**One CMS, three publications, one website.**

Phase 1 lays the foundation: Astro on Cloudflare with TypeScript, Tailwind,
SEO metadata, RSS, sitemap, responsive layout, and dark mode.

## Development

```sh
pnpm install
pnpm dev
```

## Verification

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Deployment

The site deploys to Cloudflare Workers as static assets:

```sh
pnpm deploy
```

The build output is `./dist/`, served through the assets directory defined in
`wrangler.jsonc`. The production deployment is reproducible from Git.

See `ARCHITECTURE.md` for the full architecture and implementation phases.

## Project structure

```text
src/
├── components/
│   ├── navigation/   SiteHeader, SiteFooter
│   └── ui/           Container, Button, Card, ThemeToggle
├── layouts/          BaseLayout
├── lib/
│   └── seo/          config, helpers, structured data
├── pages/            index, about, 404, robots.txt, rss.xml
└── styles/           global.css (Tailwind)
tests/                Vitest suite
```

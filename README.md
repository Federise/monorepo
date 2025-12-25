# Federise Monorepo

A pnpm monorepo for the Federise project.

## Structure

```
federise-monorepo/
├── apps/
│   ├── gateway/     # Cloudflare Workers API (Hono + Chanfana)
│   └── org/         # Astro website
└── packages/        # Shared packages (empty for now)
```

## Getting Started

```bash
pnpm install
pnpm dev
```

## API Client Generation

The org app uses a type-safe API client generated from the gateway's OpenAPI spec.

**Regenerate after gateway API changes:**

```bash
pnpm -w generate:api
```

This runs two commands:
1. `federise-gateway generate-openapi` - generates `openapi.json` from source
2. `federise-org generate:api` - generates TypeScript types from the spec

## Scripts

```bash
pnpm dev           # Start all apps
pnpm build         # Build all apps
pnpm test          # Run all tests
pnpm -w generate:api  # Regenerate API types
```

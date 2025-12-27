# Federise Monorepo

A pnpm monorepo for the Federise project.

## Structure

```
federise-monorepo/
├── apps/
│   ├── gateway/     # Cloudflare Workers API (git submodule: Federise/deploy)
│   └── org/         # Astro website
└── packages/        # Shared packages (empty for now)
```

## Getting Started

```bash
# Clone with submodules
git clone --recursive git@github.com:Federise/monorepo.git

# Or if already cloned, initialize submodules
git submodule update --init --recursive

# Install dependencies
pnpm install

# Install gateway dependencies (submodule has own lockfile)
cd apps/gateway && pnpm install && cd ../..

# Start development servers
pnpm dev
```

### Submodule Setup

The gateway is a separate repository included as a submodule:

```bash
# First time: initialize submodule
git submodule update --init --recursive

# Install gateway dependencies
cd apps/gateway && pnpm install && cd ../..
```

### Updating Gateway

```bash
# Pull latest gateway changes
cd apps/gateway && git pull origin main && cd ../..

# Update submodule reference in monorepo
git add apps/gateway
git commit -m "chore: update gateway submodule"
```

## API Client Generation

The org app uses a type-safe API client generated from the gateway's OpenAPI spec.

**Regenerate after gateway API changes:**

```bash
# Make sure gateway dependencies are installed
cd apps/gateway && pnpm install && cd ../..

# Generate API types
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

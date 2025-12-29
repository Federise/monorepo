# Federise Monorepo

A pnpm monorepo for the Federise project.

## Documentation

- **[Architecture Guide](docs/ARCHITECTURE.md)** - Comprehensive overview of the system architecture, apps, packages, and how they work together
- **[Developer Guide](docs/DEVELOPER_GUIDE.md)** - How to integrate Federise into your applications using the SDK

## Structure

```
federise-monorepo/
├── apps/
│   ├── gateway/     # Cloudflare Workers API
│   ├── org/         # Frame, auth, management
│   └── demo/        # Demo application
├── packages/
│   └── sdk/         # @federise/sdk - Browser SDK for host applications
└── docs/            # Documentation
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

# Federise Monorepo

A pnpm monorepo for the Federise project.

## Documentation

- **[Architecture Guide](docs/ARCHITECTURE.md)** - Comprehensive overview of the system architecture, apps, packages, and how they work together
- **[Developer Guide](docs/DEVELOPER_GUIDE.md)** - How to integrate Federise into your applications using the SDK

## Local Development

```bash
./scripts/dev.sh start          # Start all services (gateway, org, demo)
./scripts/dev.sh start --reset  # Clear local state and start fresh
./scripts/dev.sh stop           # Stop all services
./scripts/dev.sh status         # Check what's running
```

Once running:

| Service | URL |
|---------|-----|
| Gateway | http://localhost:3000 |
| Org | http://localhost:4321 |
| Demo | http://localhost:5174 |

The start command automatically provisions a development identity and outputs the gateway URL and API key.

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

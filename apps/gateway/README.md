# Federise Gateway (Cloudflare Workers)

Deploy Federise Gateway to Cloudflare Workers with KV and R2 storage.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Deno](https://deno.land/) runtime
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (included as dev dependency)
- Cloudflare account with Workers, KV, and R2 enabled

## Quick Start

### 1. Authenticate with Cloudflare

```bash
npx wrangler login
```

### 2. Deploy

```bash
npm run deploy
```

This will:
- Create a KV namespace (`federise-kv`)
- Create R2 buckets (`federise-private`, `federise-public`)
- Generate a bootstrap API key
- Deploy the worker

On first deployment, save the bootstrap API key - you'll need it to create identities.

### 3. Test

```bash
curl https://federise-gateway.<your-subdomain>.workers.dev/ping \
  -H "Authorization: ApiKey <your-bootstrap-key>"
```

## Deployment Commands

| Command | Description |
|---------|-------------|
| `npm run deploy` | Full deployment (provisions resources + deploys code) |
| `npm run deploy:code` | Deploy code only (skip resource provisioning) |
| `npm run deploy:status` | Show current deployment status |
| `npm run deploy:destroy` | Destroy all resources (with confirmation) |

## Development

```bash
# Start local dev server
npm run dev

# Run tests
npm test
```

## Configuration

### Environment Variables

Set these in `wrangler.jsonc` or via `wrangler secret put`:

| Variable | Required | Description |
|----------|----------|-------------|
| `BOOTSTRAP_API_KEY` | Yes | Initial API key for creating identities |
| `CORS_ORIGIN` | No | Allowed CORS origin (default: `*`) |
| `PUBLIC_DOMAIN` | No | Custom domain for public blob URLs |
| `R2_ACCOUNT_ID` | No* | For presigned URLs |
| `R2_ACCESS_KEY_ID` | No* | For presigned URLs |
| `R2_SECRET_ACCESS_KEY` | No* | For presigned URLs |

*Required if you want to use presigned upload URLs

### Presigned URLs (Direct Browser Uploads)

Presigned URLs allow clients to upload directly to R2, bypassing the worker (supports large files, better performance).

**The deploy script automatically:**
- Configures CORS on R2 buckets (required for browser uploads)

**You still need to configure R2 API credentials:**

1. Go to Cloudflare Dashboard → R2 → Manage R2 API Tokens
2. Create a token with read/write access to your buckets
3. Add the credentials as secrets:

```bash
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
```

4. Add your account ID to `wrangler.json` (or use `wrangler secret put`):
```bash
# Find your account ID in the Cloudflare dashboard URL
npx wrangler secret put R2_ACCOUNT_ID
```

**Upload flow:**
1. Client requests presigned URL: `POST /blob/presign-upload`
2. Gateway returns a signed R2 URL (valid 1 hour)
3. Client uploads directly to R2 using the presigned URL
4. Metadata is pre-created in KV

## State Management

The deployment script stores resource IDs in `.federise-state.json` (gitignored). This enables:

- **Idempotent deployments**: Re-running deploy reuses existing resources
- **Code-only updates**: `deploy:code` skips resource checks
- **Clean teardown**: `deploy:destroy` removes all resources

## Architecture

```
Cloudflare Workers
├── KV Namespace (federise-kv)
│   ├── Identities (__IDENTITY:*)
│   ├── Blob metadata (__BLOB:*)
│   └── User KV data (namespace:key)
├── R2 Bucket (federise-private)
│   └── Private blobs
└── R2 Bucket (federise-public)
    └── Public blobs
```

## API Documentation

Once deployed, OpenAPI docs are available at:
```
https://federise-gateway.<your-subdomain>.workers.dev/openapi
```

## Troubleshooting

### "Not authenticated"
Run `npx wrangler login` and try again.

### "KV namespace not found"
Run full deployment (`npm run deploy`) instead of code-only.

### Presigned URLs not working
Ensure R2 API credentials are configured. Check with:
```bash
npx wrangler secret list
```

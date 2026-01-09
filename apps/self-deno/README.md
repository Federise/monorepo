# Federise Gateway - Deno Self-Hosted

A zero-dependency single binary version of the Federise Gateway, compiled with Deno.

## Features

- **Single Binary**: Compile to a standalone executable with zero runtime dependencies
- **Cross-Platform**: Build for Linux, macOS (Intel/ARM), and Windows
- **Deno KV Storage**: Uses Deno's built-in KV store (SQLite under the hood)
- **S3-Compatible Blob Storage**: Works with MinIO, AWS S3, Cloudflare R2

## Quick Start

### Running from Source

```bash
# Development mode (with hot reload)
deno task dev

# Production mode
deno task start
```

### Compiling to Binary

```bash
# Compile for current platform
deno task compile

# Cross-compile for specific platforms
deno task compile:linux      # Linux x86_64
deno task compile:macos      # macOS Intel
deno task compile:macos-arm  # macOS Apple Silicon
deno task compile:windows    # Windows x86_64
```

### Running the Binary

```bash
# Set required environment variables
export BOOTSTRAP_API_KEY="your-secret-key"
export S3_ENDPOINT="http://localhost:9000"
export S3_ACCESS_KEY_ID="minioadmin"
export S3_SECRET_ACCESS_KEY="minioadmin"

# Run the gateway
./federise-gateway
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BOOTSTRAP_API_KEY` | Yes | - | API key for initial setup |
| `S3_ENDPOINT` | Yes | - | S3-compatible storage endpoint |
| `S3_ACCESS_KEY_ID` | Yes | - | S3 access key |
| `S3_SECRET_ACCESS_KEY` | Yes | - | S3 secret key |
| `PORT` | No | `3000` | Server port |
| `CORS_ORIGIN` | No | `*` | CORS allowed origins |
| `KV_PATH` | No | (Deno default) | Path for KV database file |
| `S3_REGION` | No | `us-east-1` | S3 region |
| `S3_PRIVATE_BUCKET` | No | `federise-private` | Private blob bucket |
| `S3_PUBLIC_BUCKET` | No | `federise-public` | Public blob bucket |
| `PUBLIC_DOMAIN` | No | - | Public URL for blob downloads |

## Architecture

This version uses:
- **Deno KV** for key-value storage (replaces SQLite + better-sqlite3)
- **AWS SDK for JS** for S3 operations (npm: imports)
- **Hono** for HTTP routing (npm: imports)
- **gateway-core** shared package for business logic

## Binary Size

The compiled binary is approximately 98MB, which includes:
- Deno runtime
- All npm dependencies (AWS SDK, Hono, Zod, etc.)
- Application code

## Differences from Node.js Version

| Aspect | Node.js (`apps/self`) | Deno (`apps/self-deno`) |
|--------|----------------------|------------------------|
| Storage | SQLite via better-sqlite3 | Deno KV (SQLite internally) |
| Distribution | Docker or Node.js install | Single binary |
| Dependencies | npm packages | Bundled in binary |
| Cross-compilation | Requires Docker multi-arch | Built-in Deno support |

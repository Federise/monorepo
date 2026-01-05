# Federise Gateway (Self-Hosted)

A self-hosted version of the Federise Gateway that runs on Node.js with SQLite for key-value storage and S3-compatible storage (MinIO/AWS S3) for blobs.

## Features

- **Key-Value Storage**: SQLite-based persistent storage
- **Blob Storage**: S3-compatible (works with MinIO, AWS S3, or any S3-compatible service)
- **Presigned URLs**: Direct upload/download via presigned S3 URLs
- **OpenAPI Documentation**: Auto-generated API docs at `/openapi`
- **Same API**: Identical API to the Cloudflare Workers version

## Quick Start

### Using Docker Compose (Recommended)

The easiest way to run the self-hosted gateway is with Docker Compose, which includes MinIO for blob storage:

```bash
# Start MinIO and the gateway
docker compose up -d

# View logs
docker compose logs -f gateway
```

The gateway will be available at `http://localhost:3000` and MinIO console at `http://localhost:9001`.

### Manual Setup

1. **Install dependencies**:
   ```bash
   pnpm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. **Start MinIO** (or configure AWS S3):
   ```bash
   docker run -d \
     -p 9000:9000 -p 9001:9001 \
     -e MINIO_ROOT_USER=minioadmin \
     -e MINIO_ROOT_PASSWORD=minioadmin \
     minio/minio server /data --console-address ":9001"
   ```

4. **Create buckets** (if using MinIO):
   ```bash
   # Install MinIO client
   brew install minio/stable/mc  # macOS
   # or download from https://min.io/download

   # Configure and create buckets
   mc alias set local http://localhost:9000 minioadmin minioadmin
   mc mb local/federise-private
   mc mb local/federise-public
   mc anonymous set download local/federise-public
   ```

5. **Run the gateway**:
   ```bash
   # Development (with hot reload)
   pnpm dev

   # Production
   pnpm build
   pnpm start
   ```

## Configuration

All configuration is done via environment variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Server port |
| `CORS_ORIGIN` | No | `*` | CORS allowed origins |
| `BOOTSTRAP_API_KEY` | **Yes** | - | Initial API key for creating principals |
| `SQLITE_PATH` | No | `./data/kv.db` | Path to SQLite database file |
| `S3_ENDPOINT` | **Yes** | - | S3 endpoint URL |
| `S3_ACCESS_KEY_ID` | **Yes** | - | S3 access key |
| `S3_SECRET_ACCESS_KEY` | **Yes** | - | S3 secret key |
| `S3_REGION` | No | `us-east-1` | S3 region |
| `S3_PRIVATE_BUCKET` | No | `federise-private` | Private blob bucket name |
| `S3_PUBLIC_BUCKET` | No | `federise-public` | Public blob bucket name |
| `PUBLIC_DOMAIN` | No | - | Public URL for blob downloads |

### Generating a Secure Bootstrap Key

```bash
openssl rand -hex 32
```

## API Usage

### Creating Your First Principal

Use the bootstrap API key to create your first principal (API key):

```bash
curl -X POST http://localhost:3000/principal/create \
  -H "Authorization: ApiKey YOUR_BOOTSTRAP_KEY" \
  -H "Content-Type: application/json" \
  -d '{"display_name": "My App"}'
```

Response:
```json
{
  "secret_hash": "abc123...",
  "display_name": "My App",
  "created_at": "2024-01-01T00:00:00.000Z",
  "active": true,
  "secret": "your-new-api-key"
}
```

Save the `secret` - this is your API key for all future requests.

### Key-Value Operations

```bash
# Set a value
curl -X POST http://localhost:3000/kv/set \
  -H "Authorization: ApiKey YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"namespace": "myapp", "key": "user:123", "value": "{\"name\": \"John\"}"}'

# Get a value
curl -X POST http://localhost:3000/kv/get \
  -H "Authorization: ApiKey YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"namespace": "myapp", "key": "user:123"}'
```

### Blob Operations

```bash
# Upload a file
curl -X POST http://localhost:3000/blob/upload \
  -H "Authorization: ApiKey YOUR_API_KEY" \
  -H "Content-Type: image/png" \
  -H "X-Blob-Namespace: myapp" \
  -H "X-Blob-Key: avatar.png" \
  --data-binary @avatar.png

# Get download URL
curl -X POST http://localhost:3000/blob/get \
  -H "Authorization: ApiKey YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"namespace": "myapp", "key": "avatar.png"}'
```

### Admin Check (Self-Hosted Only)

Check the status of all dependencies:

```bash
curl -X POST http://localhost:3000/admin/check \
  -H "Authorization: ApiKey YOUR_BOOTSTRAP_KEY" \
  -H "Content-Type: application/json"
```

Response:
```json
{
  "kv": { "ok": true },
  "r2_private": { "ok": true },
  "r2_public": { "ok": true },
  "presigned_ready": true,
  "principals_exist": false
}
```

## API Reference

Full API documentation is available at `/openapi` when the server is running.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/ping` | Health check |
| POST | `/principal/create` | Create a new API key |
| POST | `/principal/list` | List all API keys |
| POST | `/principal/delete` | Delete an API key |
| POST | `/kv/get` | Get a value |
| POST | `/kv/set` | Set a value |
| POST | `/kv/keys` | List keys in namespace |
| POST | `/kv/namespaces` | List all namespaces |
| POST | `/kv/bulk/get` | Bulk get values |
| POST | `/kv/bulk/set` | Bulk set values |
| POST | `/kv/dump` | Dump all data |
| POST | `/blob/upload` | Upload a file |
| POST | `/blob/presign-upload` | Get presigned upload URL |
| POST | `/blob/get` | Get download URL |
| POST | `/blob/delete` | Delete a file |
| POST | `/blob/list` | List files |
| GET | `/blob/download/:ns/:key` | Download a file |
| POST | `/admin/check` | Check dependencies (self-hosted only) |

## Development

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Build for production
pnpm build

# Clean build artifacts
pnpm clean
```

## Production Deployment

### Docker

Build and run with Docker:

```bash
docker build -t federise-self .
docker run -p 3000:3000 \
  -e BOOTSTRAP_API_KEY=your-secure-key \
  -e S3_ENDPOINT=https://your-s3-endpoint \
  -e S3_ACCESS_KEY_ID=your-access-key \
  -e S3_SECRET_ACCESS_KEY=your-secret-key \
  -v /path/to/data:/data \
  federise-self
```

### Security Considerations

1. **Generate a secure bootstrap key** for production
2. **Use HTTPS** in production (put behind a reverse proxy like nginx or Caddy)
3. **Restrict CORS** to your actual domains
4. **Secure your S3 credentials** using secrets management
5. **Back up your SQLite database** regularly

## Architecture

```
apps/self/
├── src/
│   ├── adapters/           # Storage adapters
│   │   ├── sqlite-kv.ts    # SQLite KV implementation
│   │   ├── s3-blob.ts      # S3 blob storage
│   │   ├── s3-presigner.ts # S3 presigned URLs
│   │   ├── memory-kv.ts    # In-memory KV (testing)
│   │   └── memory-blob.ts  # In-memory blob (testing)
│   ├── endpoints/
│   │   └── admin/check.ts  # Self-hosted only endpoint
│   ├── env.ts              # Configuration loader
│   └── index.ts            # Entry point
├── test/
│   ├── setup.ts            # Test configuration
│   └── e2e.test.ts         # End-to-end tests
└── docker-compose.yml      # Local development stack
```

The gateway uses shared code from `@federise/gateway-core` for all endpoint logic, ensuring feature parity with the Cloudflare Workers version.

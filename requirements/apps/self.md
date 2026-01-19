# apps/self - Self-Hosted Deno Gateway

## Overview

The self-hosted gateway is a Deno-based implementation designed to run as a single compiled binary with zero external dependencies beyond the Deno runtime. It provides an alternative to the Cloudflare Workers gateway for organizations requiring on-premises deployment or custom infrastructure.

## Technical Specifications

| Aspect | Value |
|--------|-------|
| Runtime | Deno |
| Binary Size | ~98MB (compiled) |
| Package | `@federise/self-deno` |
| Entry Point | `src/main.ts` |
| Supported Platforms | Linux x86_64, macOS (Intel/ARM), Windows x86_64 |

## Architecture

### Component Structure

```
apps/self/
├── src/
│   ├── main.ts                    # Entry point, server setup
│   ├── env.ts                     # Configuration loading
│   ├── adapters/
│   │   ├── deno-kv.ts            # Deno KV adapter
│   │   ├── filesystem-blob.ts     # Filesystem blob storage
│   │   ├── filesystem-presigner.ts # HMAC token presigning
│   │   ├── s3-blob.ts            # S3/MinIO blob storage
│   │   └── s3-presigner.ts       # S3 presigned URLs
│   ├── endpoints/
│   │   ├── admin/check.ts        # Health check endpoint
│   │   └── blob/presigned-routes.ts # Token-based uploads
│   └── lib/
│       ├── acme.ts               # Let's Encrypt (unused)
│       ├── tls.ts                # Self-signed certs (unused)
│       └── signing.ts            # HMAC token signing
├── deno.json                      # Deno configuration
└── .env.example                   # Configuration template
```

### Startup Flow

```typescript
// src/main.ts startup sequence
1. Load .env file (line 28)
2. Parse configuration (line 31)
3. Initialize Deno KV (line 50)
4. Pre-provision __ORG:permissions if missing (lines 53-57)
5. Initialize blob storage adapter (lines 59-98)
   └─ Filesystem mode OR S3 mode
6. Configure middleware stack (lines 101-148)
7. Start HTTP server (lines 157-175)
```

### Storage Mode Selection

```typescript
// src/env.ts:40-46
const explicitMode = Deno.env.get("BLOB_STORAGE") as BlobStorageMode;
const hasS3Config = Deno.env.get("S3_ENDPOINT") && Deno.env.get("S3_ACCESS_KEY_ID");
const blobStorageMode = explicitMode || (hasS3Config ? "s3" : "filesystem");
```

**Auto-detection:**
- If `BLOB_STORAGE` is set, use that mode
- Else if S3 credentials present, use S3 mode
- Else default to filesystem mode

## Storage Adapters

### Deno KV Adapter (`adapters/deno-kv.ts`)

**Backend:** SQLite (managed by Deno runtime)

```typescript
class DenoKVStore implements IKVStore {
  private kv: Deno.Kv | null = null;

  // Lazy initialization
  private async getKv(): Promise<Deno.Kv> {
    if (!this.kv) {
      this.kv = await Deno.openKv(this.path);
    }
    return this.kv;
  }

  // All keys stored under ["kv", key] tuple
  async get(key: string): Promise<string | null> {
    const kv = await this.getKv();
    const result = await kv.get<string>(["kv", key]);
    return result.value;
  }
}
```

**Storage Location:** `{DATA_DIR}/kv.db` (SQLite file)

**Key Namespace:** All keys prefixed with `["kv", ...]` tuple

### Filesystem Blob Adapter (`adapters/filesystem-blob.ts`)

**Key-to-Path Mapping:**
```
Key: namespace:folder/file.txt
Path: {DATA_DIR}/blobs/{visibility}/namespace/folder/file.txt
Metadata: {path}.meta.json
```

**Operations:**

| Method | Implementation |
|--------|----------------|
| get() | `Deno.open()` → ReadableStream |
| put() | Buffer entire file → `Deno.writeFile()` |
| delete() | `Deno.remove()` for file + metadata |
| list() | Recursive `walkDirectory()` |

**Directory Structure:**
```
{DATA_DIR}/blobs/
├── private/
│   └── {namespace}/
│       ├── {key}
│       └── {key}.meta.json
└── public/
    └── {namespace}/
        ├── {key}
        └── {key}.meta.json
```

### S3/MinIO Adapter (`adapters/s3-blob.ts`)

**Configuration:**
```typescript
interface S3BlobStoreConfig {
  endpoint: string;           // e.g., "http://minio:9000"
  region?: string;           // e.g., "us-east-1"
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  forcePathStyle?: boolean;  // Default: true (required for MinIO)
}
```

**AWS SDK Usage:**
- Uses `@aws-sdk/client-s3` for operations
- Uses `@aws-sdk/s3-request-presigner` for presigned URLs
- Compatible with S3, MinIO, Cloudflare R2, and other S3-compatible services

### Presigning Adapters

#### Filesystem Presigner (`adapters/filesystem-presigner.ts`)

Token-based presigning without external dependencies:

```typescript
// Token format
{
  "payload": "{\"bucket\":\"...\",\"key\":\"...\",\"contentType\":\"...\",\"expiresAt\":...}",
  "signature": "base64-hmac-sha256"
}

// URL format
/blob/presigned-put?token={base64_token}
/blob/presigned-get?token={base64_token}
```

**Flow:**
1. Client requests presigned URL
2. Gateway generates HMAC-signed token
3. Client uses token to upload/download
4. Gateway validates token on subsequent request

#### S3 Presigner (`adapters/s3-presigner.ts`)

Direct S3 presigned URLs using AWS SDK:

```typescript
async getSignedUploadUrl(bucket, key, options) {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: options.contentType,
    ContentLength: options.contentLength
  });
  return getSignedUrl(this.client, command, { expiresIn: options.expiresIn });
}
```

**Advantage:** Client uploads directly to S3, bypassing gateway bandwidth.

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| PORT | No | 3000 | HTTP server port |
| DATA_DIR | No | `./data` | Data directory path |
| KV_PATH | No | Auto | Deno KV database path |
| CORS_ORIGIN | No | `"*"` | CORS allowed origins |
| BOOTSTRAP_API_KEY | No | - | Initial admin key |
| SIGNING_SECRET | No | Auto-generated | HMAC signing key |
| BLOB_STORAGE | No | Auto-detect | `"filesystem"` or `"s3"` |
| S3_ENDPOINT | Conditional | - | S3/MinIO endpoint |
| S3_ACCESS_KEY_ID | Conditional | - | S3 access key |
| S3_SECRET_ACCESS_KEY | Conditional | - | S3 secret key |
| S3_BUCKET | Conditional | - | S3 bucket name |
| S3_REGION | No | `"auto"` | S3 region |
| PRESIGN_EXPIRES_IN | No | 3600 | Presigned URL TTL (seconds) |

### Deno Configuration

```json
// deno.json
{
  "name": "@federise/self-deno",
  "unstable": ["kv", "sloppy-imports"],
  "compilerOptions": {
    "strict": true,
    "lib": ["deno.window", "deno.unstable"]
  },
  "tasks": {
    "dev": "deno run -A --watch src/main.ts",
    "start": "deno run -A src/main.ts",
    "compile": "deno compile -A -o federise-gateway src/main.ts",
    "compile:linux": "deno compile -A --target x86_64-unknown-linux-gnu ...",
    "compile:macos": "deno compile -A --target x86_64-apple-darwin ...",
    "compile:macos-arm": "deno compile -A --target aarch64-apple-darwin ...",
    "compile:windows": "deno compile -A --target x86_64-pc-windows-msvc ..."
  }
}
```

## Performance Characteristics

### Latency Profile

| Operation | Filesystem | S3 | Bottleneck |
|-----------|------------|-----|------------|
| KV Get | 1-5ms | 1-5ms | SQLite read |
| KV Set | 2-10ms | 2-10ms | SQLite write |
| Blob Get (small) | 5-20ms | 50-150ms | Disk I/O / Network |
| Blob Get (large) | Variable | Variable | Disk I/O / Network |
| Blob Put (small) | 10-50ms | 50-200ms | Disk I/O / Network |
| Blob Put (large) | High | High | Memory buffering |
| List Keys | 5-50ms | 20-100ms | Iteration |

### Memory Constraints

**Critical Issue:** All uploads buffer entire file in memory

```typescript
// filesystem-blob.ts:133-147
const chunks: Uint8Array[] = [];
const reader = body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  chunks.push(value);
}
const combined = new Uint8Array(totalLength);
// ... combine chunks
await Deno.writeFile(filePath, combined);
```

**Impact:**
- 1GB upload = 1GB memory spike
- Risk of OOM on large files
- No true streaming

### Throughput

| Resource | Limit | Source |
|----------|-------|--------|
| Concurrent connections | System limit | OS |
| File handles | System limit | OS |
| KV connections | 1 (singleton) | Implementation |
| Request body size | Available RAM | Memory buffering |

## Security Implementation

### Authentication

Identical to Cloudflare gateway - uses `gateway-core` auth middleware:
- API key authentication
- Bootstrap key for initial setup
- Token-based channel access

### Presigned Token Security

```typescript
// lib/signing.ts
async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}
```

**Token Lifecycle:**
1. Generate: `createUploadToken(bucket, key, contentType, contentLength, secret)`
2. Encode: Base64 JSON containing payload + signature
3. Transmit: Query parameter `?token=...`
4. Validate: `validateUploadToken(token, secret)`
5. Execute: Upload/download if valid and not expired

### CORS & Private Network Access

```typescript
// main.ts:119-134
app.use(cors({
  origin: config.corsOrigin || "*",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-Blob-*", "X-Channel-Token"],
  exposeHeaders: ["Content-Length", "Content-Disposition"],
  maxAge: 86400
}));

// Private Network Access for localhost
app.use(async (c, next) => {
  if (c.req.header("Access-Control-Request-Private-Network") === "true") {
    c.res.headers.set("Access-Control-Allow-Private-Network", "true");
  }
  return next();
});
```

## Differences from Cloudflare Gateway

| Aspect | Cloudflare | Self-Hosted |
|--------|------------|-------------|
| **Runtime** | Workers | Deno |
| **Distribution** | Global edge | Single location |
| **Scaling** | Auto | Manual |
| **KV Backend** | Cloudflare KV | Deno KV (SQLite) |
| **Blob Backend** | R2 | Filesystem or S3 |
| **Channel Backend** | Durable Objects | Not implemented (metadata only) |
| **TLS** | Cloudflare managed | Self-signed or ACME |
| **Binary** | N/A | ~98MB executable |
| **Startup** | Instant | ~100-200ms |
| **Cost Model** | Pay-per-use | Infrastructure cost |

## Known Issues

### Critical

| Issue | Description | Location |
|-------|-------------|----------|
| Memory Exhaustion | Full file buffering on uploads | `filesystem-blob.ts:133-147` |
| No Channel Persistence | Channel events not stored in self-hosted | `cloudflare-channel-do.ts` not ported |
| ACME Unused | TLS/ACME code present but not integrated | `lib/acme.ts`, `lib/tls.ts` |

### High Priority

| Issue | Description | Location |
|-------|-------------|----------|
| No Graceful Shutdown | Missing SIGTERM handler | `main.ts:175` |
| Port 80 Hardcoded | ACME requires root access | `lib/acme.ts:200-228` |
| Presigned Bucket Logic | String matching for bucket selection | `presigned-routes.ts:58,88` |
| No Upload Size Limit | DoS via huge uploads | `presigned-routes.ts:47` |

### Medium Priority

| Issue | Description | Location |
|-------|-------------|----------|
| KV Cursor Bug | `<=` instead of `<` may cause duplicates | `deno-kv.ts:79-82` |
| Self-Signed SANs | Only localhost/127.0.0.1 supported | `lib/tls.ts:54-58` |
| Directory Traversal | O(n) listing for large stores | `filesystem-blob.ts:214-268` |

## Deployment

### Compilation

```bash
# Native architecture
deno task compile

# Cross-compilation
deno task compile:linux
deno task compile:macos
deno task compile:macos-arm
deno task compile:windows
```

### Required Permissions

```bash
deno compile \
  --allow-net \          # HTTP server
  --allow-env \          # Environment variables
  --allow-read \         # File/KV reading
  --allow-write \        # File/KV writing
  --allow-sys \          # System information
  -o federise-gateway \
  src/main.ts
```

### Filesystem Mode Deployment

```bash
# Minimal setup
./federise-gateway

# With configuration
DATA_DIR=/var/federise \
BOOTSTRAP_API_KEY=mykey123 \
./federise-gateway
```

**Persistent Data:**
- `./data/kv.db` - Deno KV database
- `./data/blobs/` - Blob storage
- `./data/signing-secret` - HMAC key

### S3 Mode Deployment

```bash
BLOB_STORAGE=s3 \
S3_ENDPOINT=http://minio:9000 \
S3_ACCESS_KEY_ID=minioadmin \
S3_SECRET_ACCESS_KEY=minioadmin \
S3_BUCKET=federise-objects \
./federise-gateway
```

### Docker Deployment

```dockerfile
FROM denoland/deno:latest

WORKDIR /app
COPY . .

RUN deno cache src/main.ts

VOLUME /data
ENV DATA_DIR=/data

EXPOSE 3000

CMD ["deno", "task", "start"]
```

## Admin Endpoint

### GET /admin/check

Returns system health status:

```json
{
  "kv": { "ok": true },
  "r2_private": { "ok": true },
  "r2_public": { "ok": true },
  "presigned_ready": true,
  "identitys_exist": true
}
```

**Tests Performed:**
1. KV connectivity (list keys)
2. Private blob storage (list objects)
3. Public blob storage (list objects)
4. Presigner configuration status
5. Identity existence check

## Dependencies

```json
// Imported via deno.json imports
{
  "@std/dotenv": "jsr:@std/dotenv@^0.225.3",
  "@std/assert": "jsr:@std/assert@^1.0.13",
  "@aws-sdk/client-s3": "npm:@aws-sdk/client-s3@^3.600.0",
  "@aws-sdk/s3-request-presigner": "npm:@aws-sdk/s3-request-presigner@^3.600.0",
  "@peculiar/x509": "npm:@peculiar/x509@^1.12.3",
  "acme-client": "npm:acme-client@^5.4.0"
}
```

## Recommendations

### Priority 1 (Critical)

1. **Implement streaming uploads** - Remove full-file buffering
2. **Add graceful shutdown** - Handle SIGTERM/SIGINT properly
3. **Port channel storage** - Implement channel persistence (SQLite)

### Priority 2 (High)

4. **Add upload size limits** - Prevent DoS
5. **Fix bucket selection** - Use explicit bucket names
6. **Integrate TLS** - Make ACME/self-signed accessible

### Priority 3 (Medium)

7. **Add connection pooling** - For S3 operations
8. **Implement cursor pagination** - For large lists
9. **Add health check endpoint** - For load balancer integration

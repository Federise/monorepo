# Federise Platform Architecture

## Executive Summary

Federise is a federated data storage and synchronization platform providing multi-tenant data management through a capability-based access control model. The platform supports two deployment modes: Cloudflare Workers (edge) and self-hosted (Deno), sharing core business logic through the `gateway-core` package.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Client Applications                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Demo App   │  │  Org Admin  │  │ Third-Party │  │   ChannelClient │    │
│  │  (Svelte)   │  │   (Astro)   │  │    Apps     │  │  (Token)    │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
└─────────┼────────────────┼────────────────┼────────────────┼───────────┘
          │                │                │                │
          │                │                │                │
          ▼                ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         SDK Layer (@federise/sdk)                        │
│  ┌────────────────────────────────┐  ┌──────────────────────────────┐  │
│  │       FederiseClient           │  │         ChannelClient            │  │
│  │   (iframe-based, multi-op)     │  │   (token-based, direct)      │  │
│  └────────────────────────────────┘  └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
          │                                        │
          │  postMessage                           │  HTTP/REST
          ▼                                        │
┌─────────────────────────────────────────────────────────────────────────┐
│                    Frame Enforcer (apps/org)                             │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  Permission Management  │  Message Routing  │  Capability Tokens   │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
          │
          │  HTTP/REST with API Key
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Gateway (Cloudflare OR Self-Hosted)                   │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    gateway-core (shared logic)                     │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │ │
│  │  │   KV     │  │   Blob   │  │ Channel  │  │    Principal     │  │ │
│  │  │ Endpoints│  │ Endpoints│  │ Endpoints│  │    Management    │  │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
          │
          │  Adapter Interface
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Storage Adapters                                 │
│  ┌─────────────────────────────┐  ┌─────────────────────────────────┐  │
│  │    Cloudflare Bindings      │  │       Self-Hosted Backends      │  │
│  │  ┌────┐ ┌────┐ ┌──────────┐│  │  ┌────────┐ ┌────────┐ ┌─────┐ │  │
│  │  │ KV │ │ R2 │ │Durable Obj││  │  │Deno KV │ │  S3    │ │ FS  │ │  │
│  │  └────┘ └────┘ └──────────┘│  │  └────────┘ └────────┘ └─────┘ │  │
│  └─────────────────────────────┘  └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Gateway Layer

The gateway provides the HTTP API for all data operations. Two implementations exist:

| Aspect | Cloudflare Gateway (apps/gateway) | Self-Hosted Gateway (apps/self) |
|--------|-----------------------------------|----------------------------------|
| Runtime | Cloudflare Workers | Deno |
| KV Storage | Cloudflare KV | Deno KV (SQLite) |
| Blob Storage | Cloudflare R2 | Filesystem or S3/MinIO |
| Log Storage | Durable Objects | In-memory (planned: SQLite) |
| Scaling | Edge-distributed, auto-scaling | Single instance |
| Cost Model | Pay-per-request | Self-hosted infrastructure |
| Binary | Not applicable | Single ~98MB executable |

### 2. Shared Core (packages/gateway-core)

Platform-agnostic business logic shared between gateway implementations:

- **Endpoints**: KV, Blob, Log, Principal CRUD operations
- **Middleware**: Authentication, CORS, token validation
- **Adapters**: Interface definitions for storage backends
- **Utilities**: HMAC signing, token generation, namespace aliasing

### 3. SDK Layer (packages/sdk)

Client libraries for accessing Federise services:

- **FederiseClient**: Full-featured iframe-based client for browser apps
- **ChannelClient**: Lightweight token-based client for channel operations only

### 4. Applications

| Application | Purpose | Technology |
|-------------|---------|------------|
| apps/org | Admin dashboard, permission management | Astro + Svelte |
| apps/demo | Feature demonstration | Svelte 5 |
| apps/gateway | Edge gateway deployment | Cloudflare Workers |
| apps/self | Self-hosted gateway | Deno |

## Design Principles

### 1. Adapter Pattern

All storage operations go through well-defined interfaces:

```typescript
interface IKVStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: KVListOptions): Promise<KVListResult>;
}

interface IBlobStore {
  get(key: string, options?: BlobGetOptions): Promise<BlobObject | null>;
  put(key: string, body: ArrayBuffer | ReadableStream, options?: BlobPutOptions): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: BlobListOptions): Promise<BlobListResult>;
}

interface IChannelStore {
  create(channelId: string, name: string, ownerNamespace: string, secret: string): Promise<ChannelStoreMetadata>;
  getMetadata(channelId: string): Promise<ChannelStoreMetadata | null>;
  append(channelId: string, options: ChannelAppendOptions): Promise<ChannelStoreEvent>;
  read(channelId: string, options?: ChannelReadOptions): Promise<ChannelStoreReadResult>;
  delete(channelId: string): Promise<void>;
}
```

### 2. Capability-Based Access Control

Access is granted through capabilities, not roles:

```typescript
type Capability =
  | 'kv:read' | 'kv:write' | 'kv:delete'
  | 'blob:read' | 'blob:write'
  | 'channel:create' | 'channel:delete'
  | 'notifications';
```

- Applications request specific capabilities
- Users approve/deny in Org admin UI
- Frame enforcer validates on each operation
- Capabilities are origin-scoped and can expire

### 3. Namespace Isolation

All data is isolated by origin/principal:

```
Namespace Format: origin_{SHA256_HASH}
Example: origin_a1b2c3d4e5f6...

Key Storage: {namespace}:{key}
Example: origin_a1b2c3...:mykey

Alias System: 8-char deterministic alias for URLs
Example: /blob/f/abc12345/myfile.png
```

### 4. Token-Based Sharing

Logs can be shared via capability tokens without requiring accounts:

```
Token Format (V3): ~34 characters
Components: version + channelId + permissions + authorId + expiresAt + HMAC signature
Usage: X-Channel-Token header or URL fragment
```

## Data Flow Patterns

### 1. Standard KV Operation

```
Client → SDK → Frame → Gateway → KV Storage
                ↓
        Permission Check
                ↓
        Namespace Resolution
                ↓
        Storage Operation
                ↓
        Response to Client
```

### 2. Presigned Blob Upload

```
Client → SDK → Frame → Gateway → Presigner
                                      ↓
                              Generate Signed URL
                                      ↓
                              Return to Client
                                      ↓
Client → Direct Upload to R2/S3 ───────→
                                      ↓
                              Blob Available
```

### 3. Token-Based Log Access

```
Log Owner → Gateway → Create Token
                          ↓
                    Token with Permissions
                          ↓
                    Share with Recipient
                          ↓
Recipient → ChannelClient → Gateway
                          ↓
                    Token Verification
                          ↓
                    Log Operation (read/write)
```

## API Surface

### Gateway Routes

| Category | Endpoint | Auth | Purpose |
|----------|----------|------|---------|
| Principal | POST /principal/create | Bootstrap/API Key | Create API credentials |
| Principal | POST /principal/list | API Key | List all principals |
| Principal | POST /principal/delete | API Key | Deactivate principal |
| KV | POST /kv/get | API Key | Get value |
| KV | POST /kv/set | API Key | Set value |
| KV | POST /kv/keys | API Key | List keys |
| KV | POST /kv/bulk/get | API Key | Batch get |
| KV | POST /kv/bulk/set | API Key | Batch set |
| Blob | POST /blob/upload | API Key | Direct upload |
| Blob | POST /blob/presign-upload | API Key | Get presigned URL |
| Blob | POST /blob/get | API Key | Get download URL |
| Blob | GET /blob/f/:ns/:key | None (public) | Public download |
| Blob | GET /blob/download/:ns/:key | API Key | Authenticated download |
| Log | POST /channel/create | API Key | Create channel |
| Log | POST /channel/append | API Key/Token | Append event |
| Log | POST /channel/read | API Key/Token | Read events |
| Log | GET /channel/subscribe | API Key/Token | SSE stream |
| Log | POST /channel/token/create | API Key | Create share token |

### SDK API

```typescript
// FederiseClient (iframe-based)
client.kv.get(key)
client.kv.set(key, value)
client.kv.delete(key)
client.kv.keys(prefix?)

client.blob.upload(file, options)
client.blob.get(key)
client.blob.delete(key)
client.blob.list()
client.blob.setVisibility(key, visibility)

client.channel.create(name)
client.channel.append(channelId, content)
client.channel.read(channelId, afterSeq?, limit?)
client.channel.createToken(channelId, permissions, expiresInSeconds?)
client.channel.delete(channelId)

// ChannelClient (token-based)
channelClient.read(afterSeq?, limit?)
channelClient.append(content)
```

## Configuration

### Environment Variables

| Variable | Gateway | Self-Hosted | Description |
|----------|---------|-------------|-------------|
| BOOTSTRAP_API_KEY | Required | Required | Initial admin key |
| CORS_ORIGIN | Optional | Optional | CORS policy (default: "*") |
| R2_BUCKET | Required | N/A | R2 bucket name |
| R2_ACCESS_KEY_ID | Optional | N/A | For presigning |
| R2_SECRET_ACCESS_KEY | Optional | N/A | For presigning |
| SIGNING_SECRET | Optional | Auto-generated | HMAC signing key |
| DATA_DIR | N/A | Optional | Data directory |
| BLOB_STORAGE | N/A | Optional | "filesystem" or "s3" |
| S3_ENDPOINT | N/A | Optional | S3/MinIO endpoint |

### Cloudflare Bindings

```json
{
  "kv_namespaces": [{ "binding": "KV", "id": "..." }],
  "r2_buckets": [{ "binding": "R2", "bucket_name": "..." }],
  "durable_objects": {
    "bindings": [{ "name": "CHANNEL_DO", "class_name": "ChannelStorageDO" }]
  }
}
```

## Versioning and Compatibility

### Protocol Version
- Current: `1` (PROTOCOL_VERSION in sdk)
- Client-server handshake validates version compatibility

### Token Formats
- V1: Legacy JSON (~200+ chars) - deprecated but supported
- V2: Binary compact (~46 chars) - supported
- V3: Ultra-compact (~34 chars) - current default

### API Compatibility
- All endpoints use POST with JSON body (RPC-style)
- OpenAPI spec auto-generated via Chanfana
- Breaking changes require version bump

## Related Documents

- [CROSS-CUTTING-CONCERNS.md](./CROSS-CUTTING-CONCERNS.md) - Security, performance, cost
- [apps/gateway.md](./apps/gateway.md) - Cloudflare gateway details
- [apps/self.md](./apps/self.md) - Self-hosted gateway details
- [packages/gateway-core.md](./packages/gateway-core.md) - Core library details
- [packages/sdk.md](./packages/sdk.md) - SDK details

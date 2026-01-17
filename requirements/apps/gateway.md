# apps/gateway - Cloudflare Workers Gateway

## Overview

The Cloudflare Workers gateway is the production-grade, edge-distributed implementation of the Federise Gateway. It leverages Cloudflare's global network for low-latency data access with automatic scaling.

## Technical Specifications

| Aspect | Value |
|--------|-------|
| Runtime | Cloudflare Workers |
| Framework | Hono 4.6.20 |
| Package | `@federise/gateway` |
| Entry Point | `src/index.ts` |
| Compatibility Date | 2025-02-04 |

## Architecture

### Middleware Pipeline

```typescript
// Order is critical - defined in src/index.ts:22-89
1. Adapter Injection (line 22-46)
   ├─ kv: CloudflareKVAdapter
   ├─ blob: CloudflareR2Adapter
   ├─ channelStore: CloudflareChannelDOAdapter
   ├─ presigner: CloudflarePresigner (optional)
   └─ config: GatewayConfig

2. CORS Middleware (line 49-59)

3. Global OPTIONS Handler (line 62)

4. Private Network Access (line 65-71)

5. Public Routes - NO AUTH (line 73-83)
   ├─ registerPublicBlobRoute()
   ├─ registerBlobDownloadRoute()
   ├─ registerTokenChannelRoutes()
   └─ registerChannelSubscribeRoute()

6. Auth Middleware (line 86)

7. Protected Gateway Routes (line 89)
```

### Storage Adapters

#### CloudflareKVAdapter (`src/adapters/cloudflare-kv.ts`)

```typescript
class CloudflareKVAdapter implements IKVStore {
  // Thin wrapper around Cloudflare KV binding
  async get(key: string): Promise<string | null>
  async put(key: string, value: string): Promise<void>
  async delete(key: string): Promise<void>
  async list(options?: KVListOptions): Promise<KVListResult>
}
```

**KV Data Schema:**
```
__PRINCIPAL:{SHA256_HASH} → { display_name, created_at, active }
__BLOB:{namespace}:{key} → { size, contentType, visibility, uploadedAt }
__CHANNEL_INDEX:{namespace}:{channelId} → { name, createdAt }
__CHANNEL_OWNER:{channelId} → { ownerNamespace }
__NS_ALIAS:{alias} → {fullNamespace}
__NS_FULL:{namespace} → {alias}
{namespace}:{key} → {user_value}
```

#### CloudflareR2Adapter (`src/adapters/cloudflare-r2.ts`)

```typescript
class CloudflareR2Adapter implements IBlobStore {
  // Supports range requests for partial content
  async get(key: string, options?: { range?: { offset, length } }): Promise<BlobObject | null>
  async put(key: string, body: ArrayBuffer | ReadableStream, options?: BlobPutOptions): Promise<void>
  async delete(key: string): Promise<void>
  async list(options?: BlobListOptions): Promise<BlobListResult>
}
```

**Features:**
- Range request support (line 19-24)
- HTTP metadata (contentType) preservation
- ETag support for caching

#### CloudflareChannelDOAdapter (`src/adapters/cloudflare-channel-do.ts`)

```typescript
class CloudflareChannelDOAdapter implements IChannelStore {
  // Routes requests to Durable Object instances by channelId
  private getDO(channelId: string): DurableObjectStub {
    const id = this.namespace.idFromName(channelId);
    return this.namespace.get(id);
  }
}
```

**DO Instance Management:**
- Each channel gets dedicated DO instance
- Instance identified by `idFromName(channelId)`
- Cloudflare manages lifecycle (create on demand, hibernate when idle)

#### CloudflarePresigner (`src/adapters/cloudflare-presigner.ts`)

```typescript
class CloudflarePresigner implements IPresigner {
  // Uses AWS SDK v3 for S3-compatible presigning
  private client: S3Client;

  async getSignedUploadUrl(bucket, key, options): Promise<{ url, expiresAt }>
  async getSignedDownloadUrl(bucket, key, options): Promise<{ url, expiresAt }>
  getPublicUrl?(bucket, key): string  // If custom domain configured
}
```

**Requirements:**
- R2_ACCOUNT_ID
- R2_ACCESS_KEY_ID
- R2_SECRET_ACCESS_KEY
- Optional: R2_CUSTOM_DOMAIN

### Durable Object: ChannelStorageDO

**Location:** `src/durable-objects/channel-storage.ts`

```typescript
export class ChannelStorageDO implements DurableObject {
  private storage: DurableObjectStorage;

  // Storage keys:
  // "meta" → ChannelMetadata JSON
  // "seq" → Current sequence number
  // "event:{paddedSeq}" → Event JSON (10-digit padded)
}
```

**Operations:**

| Method | Description |
|--------|-------------|
| `create(meta)` | Initialize channel with metadata |
| `getMetadata()` | Retrieve channel metadata |
| `append(content, authorId)` | Atomically append event |
| `read(afterSeq, limit)` | Read events with pagination |
| `delete()` | Remove all channel data |

**Atomic Append Implementation (line 59-81):**
```typescript
async append(options: LogAppendOptions): Promise<LogStoreEvent> {
  const currentSeq = await this.storage.get<number>('seq') || 0;
  const newSeq = currentSeq + 1;
  const paddedSeq = String(newSeq).padStart(10, '0');

  const event = {
    id: crypto.randomUUID(),
    seq: newSeq,
    authorId: options.authorId,
    content: options.content,
    createdAt: new Date().toISOString()
  };

  // Atomic transaction
  await this.storage.put({
    'seq': newSeq,
    [`event:${paddedSeq}`]: JSON.stringify(event)
  });

  return event;
}
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| BOOTSTRAP_API_KEY | Yes | - | Initial admin key for principal creation |
| CORS_ORIGIN | No | `"*"` | CORS allowed origins |
| R2_BUCKET | No | `"federise-objects"` | R2 bucket name |
| R2_ACCOUNT_ID | No | - | For presigned URLs |
| R2_ACCESS_KEY_ID | No | - | For presigned URLs |
| R2_SECRET_ACCESS_KEY | No | - | For presigned URLs |
| R2_CUSTOM_DOMAIN | No | - | Custom domain for public URLs |
| PRESIGN_EXPIRES_IN | No | `3600` | Presigned URL TTL (seconds) |

### Wrangler Configuration

```jsonc
// wrangler.jsonc
{
  "name": "federise-gateway",
  "main": "src/index.ts",
  "compatibility_date": "2025-02-04",
  "observability": { "enabled": true },
  "kv_namespaces": [
    { "binding": "KV", "id": "c247182ded134b94ac691fedef2866f4" }
  ],
  "r2_buckets": [
    { "binding": "R2", "bucket_name": "federise-objects" }
  ],
  "durable_objects": {
    "bindings": [
      { "name": "CHANNEL_DO", "class_name": "ChannelStorageDO" }
    ]
  },
  "migrations": [
    { "tag": "v1", "new_classes": ["ChannelStorageDO"] }
  ]
}
```

## Performance Characteristics

### Latency Profile

| Operation | P50 | P95 | P99 | Bottleneck |
|-----------|-----|-----|-----|------------|
| KV Get | 15ms | 30ms | 50ms | KV lookup |
| KV Set | 25ms | 50ms | 80ms | KV write |
| R2 Get (small) | 30ms | 80ms | 150ms | R2 fetch |
| R2 Get (large) | 50ms | 200ms | 500ms | Network |
| R2 Put | 50ms | 150ms | 300ms | R2 write |
| DO Append | 60ms | 120ms | 200ms | Global coordination |
| DO Read | 40ms | 100ms | 180ms | DO storage |

### Throughput Limits

| Resource | Limit | Source |
|----------|-------|--------|
| Worker CPU time | 30 seconds (Unbound) | Cloudflare |
| KV key size | 512 bytes | Cloudflare |
| KV value size | 25 MB | Cloudflare |
| R2 object size | 5 TB | Cloudflare |
| DO storage | 1 GB per instance | Cloudflare |
| DO websockets | 32,768 per instance | Cloudflare |
| Channel append rate | ~20/sec per channel | DO coordination |

### Scalability

**Strengths:**
- Edge-distributed (global low latency)
- Auto-scaling (no capacity planning)
- High availability (Cloudflare SLA)

**Limitations:**
- Single DO instance per channel (serialized appends)
- KV eventual consistency (stale reads possible)
- No cross-region transactions

## Security Implementation

### Authentication Flow

```
Request → Extract Authorization header
        ↓
        Parse "ApiKey {key}" format (regex validation)
        ↓
        Bootstrap key? → Only if /principal/create AND no principals exist
        ↓
        Hash key with SHA-256
        ↓
        Lookup __PRINCIPAL:{hash} in KV
        ↓
        Validate principal.active === true
        ↓
        Pass to endpoint handler
```

### Token-Based Authentication

```
Request → Check X-Channel-Token header
        ↓
        Token present? → Pass through to auth middleware
        ↓
        Parse token (detect V1/V2/V3 format)
        ↓
        Extract channelId from token
        ↓
        Load channel metadata (get secret)
        ↓
        Verify HMAC signature (timing-safe)
        ↓
        Check expiration
        ↓
        Validate permissions (read/write)
        ↓
        Execute operation
```

## Cost Analysis

### Per-Operation Costs

| Operation | KV Reads | KV Writes | R2 Class A | R2 Class B | DO Requests |
|-----------|----------|-----------|------------|------------|-------------|
| Principal Create | 1 | 1 | - | - | - |
| KV Get | 1 | - | - | - | - |
| KV Set | - | 1 | - | - | - |
| Blob Upload | 1 | 2 | 1 | - | - |
| Blob Download | 1 | - | - | 1 | - |
| Presign Upload | 1 | 1 | - | - | - |
| Channel Create | 1 | 2 | - | - | 1 |
| Channel Append | - | - | - | - | 1 |
| Channel Read | - | - | - | - | 1 |

### Monthly Cost Projection

```
Light Usage (1,000 ops/day):
- Workers: Free tier
- KV: Free tier
- R2: ~$0.15
- DO: ~$0.05
Total: ~$0.20/month

Medium Usage (10,000 ops/day):
- Workers: Free tier
- KV: ~$1.50
- R2: ~$1.35
- DO: ~$0.50
Total: ~$3.35/month

Heavy Usage (100,000 ops/day):
- Workers: ~$1.50
- KV: ~$15.00
- R2: ~$13.50
- DO: ~$4.50
Total: ~$34.50/month
```

## Known Issues

### Critical

| Issue | Description | Location | Mitigation |
|-------|-------------|----------|------------|
| DO Bottleneck | Single DO instance per channel limits throughput to ~20 appends/sec | `cloudflare-channel-do.ts:21-23` | Implement channel sharding |
| No SSE Heartbeat | Long-lived connections timeout without data | `subscribe.ts:55` | Add 30-second heartbeat |

### High Priority

| Issue | Description | Location |
|-------|-------------|----------|
| Orphaned Metadata | Presigned upload creates metadata before upload completes | `presign-upload.ts` |
| Bootstrap Key Exposed | Key visible in wrangler.json | `wrangler.jsonc:24` |
| SIGNING_SECRET Unused | Defined but never consumed | `env.d.ts:9`, `index.ts:40` |

### Medium Priority

| Issue | Description | Location |
|-------|-------------|----------|
| N+1 Principal List | Lists keys then fetches each value | `principal/list.ts:26-45` |
| No Rate Limiting | Auth endpoints vulnerable to brute force | `middleware/auth.ts` |
| Race Condition | Bootstrap key check uses eventual consistency | `auth.ts:48-52` |

## Deployment

### Scripts

```bash
# Full deployment
pnpm run deploy

# Code-only update
pnpm run deploy:code

# Check status
pnpm run deploy:status

# Teardown
pnpm run deploy:destroy
```

### State Management

Deployment state stored in `.federise-state.json`:
```json
{
  "environment": "production",
  "kv_namespace_id": "...",
  "r2_bucket": "federise-objects",
  "worker_name": "federise-gateway",
  "bootstrap_api_key": "...",
  "deployed_at": "2025-01-13T..."
}
```

## Dependencies

### Production

| Package | Version | Purpose |
|---------|---------|---------|
| @federise/gateway-core | workspace:* | Shared business logic |
| @aws-sdk/client-s3 | ^3.958.0 | R2 presigning |
| @aws-sdk/s3-request-presigner | ^3.958.0 | Presigned URL generation |
| chanfana | ^2.6.3 | OpenAPI documentation |
| hono | ^4.6.20 | Web framework |
| zod | ^3.24.1 | Schema validation |

### Development

| Package | Version | Purpose |
|---------|---------|---------|
| @cloudflare/vitest-pool-workers | ^0.6.4 | Workers test environment |
| typescript | ^5.7.3 | Type checking |
| vitest | ^2.1.8 | Test framework |
| wrangler | ^4.56.0 | Deployment CLI |

## API Reference

See [ARCHITECTURE.md](../ARCHITECTURE.md#api-surface) for full API documentation.

### Route Summary

| Auth | Method | Path | Handler |
|------|--------|------|---------|
| None | OPTIONS | * | CORS preflight |
| None | GET | /blob/f/:ns/:key | Public blob download |
| Token | POST | /channel/read | Read channel events |
| Token | POST | /channel/append | Append channel event |
| Token | GET | /channel/subscribe | SSE subscription |
| Key | POST | /principal/* | Principal management |
| Key | POST | /kv/* | KV operations |
| Key | POST | /blob/* | Blob operations |
| Key | POST | /channel/* | Log operations |

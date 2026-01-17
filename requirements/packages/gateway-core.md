# packages/gateway-core - Shared Gateway Logic

## Overview

The gateway-core package contains platform-agnostic business logic shared between the Cloudflare Workers gateway and the self-hosted Deno gateway. It provides endpoint implementations, middleware, adapter interfaces, and utility functions.

## Technical Specifications

| Aspect | Value |
|--------|-------|
| Package | `@federise/gateway-core` |
| Version | 0.1.0 |
| Type | ES Module |
| Entry | `dist/index.js` |
| TypeScript | 5.7.3 (strict mode) |

## Architecture

### Module Structure

```
src/
├── index.ts                 # Public exports
├── context.ts               # Context types and helpers
├── routes.ts                # Route registration
├── types.ts                 # Zod schemas and types
├── adapters/
│   ├── index.ts            # Adapter exports
│   ├── kv.ts               # IKVStore interface
│   ├── blob.ts             # IBlobStore interface
│   ├── presigner.ts        # IPresigner interface
│   └── channel.ts              # IChannelStore interface
├── endpoints/
│   ├── ping.ts             # Health check
│   ├── kv/                 # KV operations
│   ├── blob/               # Blob operations
│   ├── channel/            # Channel operations
│   └── principal/          # Principal management
├── middleware/
│   └── auth.ts             # Authentication middleware
└── lib/
    ├── crypto.ts           # Key generation/hashing
    ├── hmac.ts             # HMAC signing
    ├── channel-token.ts        # Capability tokens
    ├── namespace-alias.ts  # URL shortening
    └── observability.ts    # Request tracking
```

## Adapter Interfaces

### IKVStore

```typescript
interface IKVStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: KVListOptions): Promise<KVListResult>;
}

interface KVListOptions {
  prefix?: string;
  limit?: number;
  cursor?: string;
}

interface KVListResult {
  keys: { name: string }[];
  cursor?: string;
  complete: boolean;
}
```

### IBlobStore

```typescript
interface IBlobStore {
  get(key: string, options?: BlobGetOptions): Promise<BlobObject | null>;
  put(key: string, body: ArrayBuffer | ReadableStream, options?: BlobPutOptions): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: BlobListOptions): Promise<BlobListResult>;
}

interface BlobObject {
  body: ReadableStream;
  size: number;
  contentType?: string;
  etag?: string;
}

interface BlobGetOptions {
  range?: { offset: number; length: number };
}
```

### IPresigner

```typescript
interface IPresigner {
  getSignedUploadUrl(
    bucket: string,
    key: string,
    options: PresignUploadOptions
  ): Promise<{ url: string; expiresAt: string }>;

  getSignedDownloadUrl(
    bucket: string,
    key: string,
    options: PresignDownloadOptions
  ): Promise<{ url: string; expiresAt: string }>;

  getPublicUrl?(bucket: string, key: string): string;
}
```

### IChannelStore

```typescript
interface IChannelStore {
  create(
    channelId: string,
    name: string,
    ownerNamespace: string,
    secret: string
  ): Promise<ChannelStoreMetadata>;

  getMetadata(channelId: string): Promise<ChannelStoreMetadata | null>;

  append(
    channelId: string,
    options: ChannelAppendOptions
  ): Promise<ChannelStoreEvent>;

  read(
    channelId: string,
    options?: ChannelReadOptions
  ): Promise<ChannelStoreReadResult>;

  delete(channelId: string): Promise<void>;
}

interface ChannelStoreEvent {
  id: string;
  seq: number;
  authorId: string;
  content: string;
  createdAt: string;
}
```

## Context System

### GatewayEnv

```typescript
interface GatewayEnv {
  kv: IKVStore;
  blob: IBlobStore;
  channelStore: IChannelStore;
  presigner?: IPresigner;
  config: GatewayConfig;
}

interface GatewayConfig {
  bootstrapApiKey?: string;
  corsOrigin?: string;
  signingSecret: string;
  bucket: string;
  presignExpiresIn?: number;
}
```

### Context Helpers

```typescript
// context.ts:40-70
export function getKV(c: AppContext): IKVStore {
  return c.get('kv');
}

export function getBlob(c: AppContext): IBlobStore {
  return c.get('blob');
}

export function getChannelStore(c: AppContext): IChannelStore {
  return c.get('channelStore');
}

export function getPresigner(c: AppContext): IPresigner | undefined {
  return c.get('presigner');
}

export function getConfig(c: AppContext): GatewayConfig {
  return c.get('config');
}
```

## Endpoints

### KV Endpoints

| Endpoint | Class | Method | Purpose |
|----------|-------|--------|---------|
| /kv/get | KVGetEndpoint | POST | Get single value |
| /kv/set | KVSetEndpoint | POST | Set single value |
| /kv/keys | KVListKeysEndpoint | POST | List keys |
| /kv/bulk/get | KVBulkGetEndpoint | POST | Batch get |
| /kv/bulk/set | KVBulkSetEndpoint | POST | Batch set |
| /kv/namespaces | KVListNamespacesEndpoint | POST | List namespaces |
| /kv/dump | KVDumpEndpoint | POST | Export all |

**Request/Response Schemas:**
```typescript
// types.ts
const GetRequest = z.object({
  namespace: NamespaceValue,
  key: z.string()
});

const GetResponse = z.object({
  value: z.string()
});
```

### Blob Endpoints

| Endpoint | Class | Method | Purpose |
|----------|-------|--------|---------|
| /blob/upload | BlobUploadEndpoint | POST | Direct upload |
| /blob/presign-upload | BlobPresignUploadEndpoint | POST | Get upload URL |
| /blob/get | BlobGetEndpoint | POST | Get download URL |
| /blob/download/:ns/:key | - | GET | Authenticated download |
| /blob/f/:ns/:key | - | GET | Public download |
| /blob/delete | BlobDeleteEndpoint | POST | Delete blob |
| /blob/list | BlobListEndpoint | POST | List blobs |
| /blob/visibility | BlobSetVisibilityEndpoint | POST | Change visibility |

**Visibility Levels:**
```typescript
const BlobVisibility = z.enum(['public', 'presigned', 'private']);
```

### Channel Endpoints

| Endpoint | Class | Method | Purpose |
|----------|-------|--------|---------|
| /channel/create | ChannelCreateEndpoint | POST | Create channel |
| /channel/list | ChannelListEndpoint | POST | List channels |
| /channel/append | ChannelAppendEndpoint | POST | Append event |
| /channel/read | ChannelReadEndpoint | POST | Read events |
| /channel/delete | ChannelDeleteEndpoint | POST | Delete channel |
| /channel/token/create | ChannelTokenCreateEndpoint | POST | Create share token |
| /channel/subscribe | - | GET | SSE stream |

### Principal Endpoints

| Endpoint | Class | Method | Purpose |
|----------|-------|--------|---------|
| /principal/create | PrincipalCreateEndpoint | POST | Create principal |
| /principal/list | PrincipalListEndpoint | POST | List principals |
| /principal/delete | PrincipalDeleteEndpoint | POST | Deactivate principal |

## Middleware

### Authentication Middleware

```typescript
// middleware/auth.ts
export function createAuthMiddleware(options?: AuthMiddlewareOptions): MiddlewareHandler {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization');

    // Validate header format
    if (!authHeader || !authHeader.match(/^ApiKey [a-zA-Z0-9_-]+$/)) {
      return c.json({ code: 401, message: 'Invalid authorization header' }, 401);
    }

    const apiKey = authHeader.slice(7);  // Remove "ApiKey "

    // Check bootstrap key (first principal creation only)
    if (config.bootstrapApiKey && apiKey === config.bootstrapApiKey) {
      // Only allow if no principals exist AND path is /principal/create
    }

    // Check principal key
    const hash = await hashApiKey(apiKey);
    const principalJson = await kv.get(`__PRINCIPAL:${hash}`);

    if (!principalJson) {
      return c.json({ code: 401, message: 'Unauthorized' }, 401);
    }

    const principal = JSON.parse(principalJson);
    if (!principal.active) {
      return c.json({ code: 401, message: 'Principal is not active' }, 401);
    }

    return next();
  };
}
```

### Token Routes Middleware

```typescript
// endpoints/channel/token-routes.ts
export function registerTokenChannelRoutes(app: Hono<{ Variables: GatewayEnv }>) {
  // Runs BEFORE auth middleware for token-based access
  app.use('/channel/read', async (c, next) => {
    const tokenHeader = c.req.header('X-Channel-Token');
    if (!tokenHeader) return next();  // Fall through to API key auth

    // Verify token and execute operation
    const verified = await verifyChannelToken(tokenHeader, meta.secret);
    if (!verified || !verified.permissions.includes('read')) {
      return c.json({ code: 403, message: 'Token lacks permission' }, 403);
    }

    // Execute read operation
  });
}
```

## Utility Libraries

### Crypto (`lib/crypto.ts`)

```typescript
// Generate 32-byte random API key
export function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// SHA-256 hash of API key
export async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
```

### HMAC Signing (`lib/hmac.ts`)

```typescript
// Sign data with HMAC-SHA256
export async function signDownloadUrl(
  namespace: string,
  key: string,
  expiresAt: number,
  secret: string
): Promise<string> {
  const payload = `${namespace}:${key}:${expiresAt}`;
  const encoder = new TextEncoder();
  const keyData = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    keyData,
    encoder.encode(payload)
  );
  return base64urlEncode(signature);
}

// Timing-safe verification
export async function verifyDownloadUrl(
  namespace: string,
  key: string,
  expiresAt: number,
  signature: string,
  secret: string
): Promise<boolean> {
  const expected = await signDownloadUrl(namespace, key, expiresAt, secret);
  return timingSafeEqual(signature, expected);
}
```

### Capability Tokens (`lib/channel-token.ts`)

**Token Formats:**

| Version | Size | Format |
|---------|------|--------|
| V1 | ~200+ chars | Base64(JSON) |
| V2 | ~46 chars | Binary (34 bytes) |
| V3 | ~34 chars | Ultra-compact (25 bytes) |

**V3 Token Structure:**
```
Byte Layout:
├── 1 byte  - Version (0x03)
├── 6 bytes - Log ID (truncated)
├── 1 byte  - Permissions bitmap
├── 2 bytes - Author ID (truncated)
├── 3 bytes - Expires (hours since epoch)
└── 12 bytes - HMAC-SHA256 signature (truncated)

Total: 25 bytes → ~34 chars Base64url
```

**Permission Bitmap:**
```typescript
const PERM_READ = 0x01;   // Bit 0
const PERM_WRITE = 0x02;  // Bit 1
```

### Namespace Aliasing (`lib/namespace-alias.ts`)

**Purpose:** Generate short aliases for long namespace strings

```typescript
// Generate 8-char alias from SHA-256
export async function generateAlias(namespace: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(namespace)
  );
  return Array.from(new Uint8Array(hash).slice(0, 4))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Storage: Bidirectional mapping
// __NS_ALIAS:{alias} → {fullNamespace}
// __NS_FULL:{namespace} → {alias}
```

## Type Definitions

### Zod Schemas (`types.ts`)

```typescript
// Principal
export const Principal = z.object({
  secret_hash: z.string(),
  display_name: z.string(),
  created_at: z.string().datetime(),
  active: z.boolean()
});

// Blob
export const BlobMetadata = z.object({
  key: z.string(),
  namespace: NamespaceValue,
  size: z.number().int().positive(),
  contentType: z.string(),
  uploadedAt: z.string().datetime(),
  visibility: BlobVisibility
});

// Log
export const ChannelEvent = z.object({
  id: z.string(),
  seq: z.number().int(),
  authorId: z.string(),
  content: z.string().max(10000),
  createdAt: z.string().datetime()
});

// Error
export const ErrorResponse = z.object({
  code: z.number().int(),
  message: z.string()
});
```

## Route Registration

```typescript
// routes.ts
export function registerGatewayRoutes(app: Hono<{ Variables: GatewayEnv }>) {
  // Chanfana OpenAPI wrapper
  const openAPIApp = fromHono(app, {
    docs_url: '/openapi'
  });

  // Principal routes
  openAPIApp.post('/principal/create', PrincipalCreateEndpoint);
  openAPIApp.post('/principal/list', PrincipalListEndpoint);
  openAPIApp.post('/principal/delete', PrincipalDeleteEndpoint);

  // KV routes
  openAPIApp.post('/kv/get', KVGetEndpoint);
  openAPIApp.post('/kv/set', KVSetEndpoint);
  // ... more routes

  // Blob routes
  openAPIApp.post('/blob/upload', BlobUploadEndpoint);
  // ... more routes

  // Log routes
  openAPIApp.post('/channel/create', ChannelCreateEndpoint);
  // ... more routes
}
```

## Public Exports

```typescript
// index.ts
// Adapters
export type { IKVStore, IBlobStore, IPresigner, IChannelStore };

// Types
export * from './types';
export * from './context';

// Crypto utilities
export { generateApiKey, hashApiKey };
export { signDownloadUrl, verifyDownloadUrl, generateSignedDownloadUrl };
export { createChannelToken, verifyChannelToken, parseChannelToken };

// Namespace utilities
export { generateAlias, isFullNamespace, resolveNamespace, getAlias, getOrCreateAlias };

// Observability
export { generateRequestId, addObservabilityHeaders };

// Middleware
export { createAuthMiddleware };

// Route registration
export {
  registerGatewayRoutes,
  registerBlobDownloadRoute,
  registerPublicBlobRoute,
  registerTokenChannelRoutes,
  registerChannelSubscribeRoute
};
```

## Security Analysis

### Strengths

| Aspect | Implementation | Status |
|--------|----------------|--------|
| API Key Hashing | SHA-256 | ✓ Strong |
| Token Signing | HMAC-SHA256 | ✓ Strong |
| Timing-Safe Compare | XOR all bytes | ✓ Good |
| Input Validation | Zod schemas | ✓ Comprehensive |

### Weaknesses

| Issue | Description | Location |
|-------|-------------|----------|
| No Rate Limiting | Auth endpoints vulnerable | `middleware/auth.ts` |
| No Token Revocation | Tokens valid until expiry | `lib/channel-token.ts` |
| N+1 Principal List | Inefficient fetching | `endpoints/principal/list.ts:26-45` |

## Performance Considerations

### Bulk Operations

- `KVBulkGetEndpoint`: Parallel Promise.all()
- `KVBulkSetEndpoint`: Sequential (no transaction support)

### Content Streaming

- Blob downloads: ReadableStream (no buffering)
- Blob uploads: Direct to storage adapter
- Range requests: Supported for partial content

### SSE Polling

```typescript
// endpoints/channel/subscribe.ts:55
const POLL_INTERVAL = 1000;  // 1 second
```

**Issue:** Fixed 1-second interval creates constant load

## Known Issues

### Critical

| Issue | Description | Location |
|-------|-------------|----------|
| Alias Collision | Incomplete handling | `namespace-alias.ts:85-92` |
| Orphaned Metadata | Presigned upload pre-creates | `presign-upload.ts` |

### High Priority

| Issue | Description | Location |
|-------|-------------|----------|
| N+1 Principal List | Fetches each value separately | `principal/list.ts:29` |
| No SSE Heartbeat | Connections timeout | `subscribe.ts:55` |
| SIGNING_SECRET | Defined but unused | Referenced in config |

### Medium Priority

| Issue | Description | Location |
|-------|-------------|----------|
| Silent JSON Parse | No error handling in some endpoints | `public-download.ts:57` |
| No Request Logging | Missing audit trail | All endpoints |

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| hono | ^4.6.20 | Web framework |
| zod | ^3.24.1 | Schema validation |
| chanfana | ^2.6.3 | OpenAPI generation |

## Recommendations

### Security

1. Add rate limiting middleware
2. Implement token revocation (blacklist in KV)
3. Add audit logging for sensitive operations

### Performance

4. Fix N+1 principal listing (batch fetch)
5. Add SSE heartbeat for long connections
6. Implement adaptive polling intervals

### Code Quality

7. Add error handling for JSON parse failures
8. Remove unused SIGNING_SECRET references
9. Add request ID to all error responses

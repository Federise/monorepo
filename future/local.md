# Local Gateway: Browser-Based Storage

## Vision

Run Federise gateway capabilities entirely in the browser, without requiring a remote server or deployment. Users get a fully functional local gateway using browser APIs (IndexedDB, Cache API, etc.).

## Key Insight: Reusing gateway-core

`gateway-core` is already environment-agnostic. It defines adapter interfaces (`IKVStore`, `IBlobStore`, `IChannelStore`), HTTP routes via Hono, and business logic for all operations.

**We can run gateway-core in a Service Worker** by:
1. Implementing adapters using browser storage APIs
2. Intercepting fetch requests to a virtual gateway endpoint
3. Routing through the same Hono app

This means the local gateway exposes the **exact same HTTP API** as the remote gateway.

## Architecture

- Web Application makes fetch requests to `/gateway/*`
- Service Worker intercepts these requests
- gateway-core (Hono) handles routing
- IndexedDB adapters (IndexedDBKVStore, IndexedDBBlobStore, IndexedDBChannelStore) persist data

## Package Structure

```
packages/local/
├── src/
│   ├── index.ts                 # Public exports
│   ├── adapters/
│   │   ├── kv.ts               # IKVStore → IndexedDB
│   │   ├── blob.ts             # IBlobStore → IndexedDB + Object URLs
│   │   └── channel.ts          # IChannelStore → IndexedDB
│   ├── gateway.ts              # Creates Hono app with local adapters
│   ├── service-worker.ts       # Service worker entry point
│   └── db.ts                   # IndexedDB schema and helpers
└── package.json
```

## Adapter Types

```typescript
interface KVRecord {
  key: string;        // Composite: namespace:key
  namespace: string;
  userKey: string;    // Original key without namespace
  value: string;
  updatedAt: string;
}

interface BlobRecord {
  key: string;
  namespace: string;
  data: ArrayBuffer;
  size: number;
  contentType: string;
  createdAt: string;
}

// IndexedDB stores:
// federise_kv: KVRecord
// federise_blobs: BlobRecord
// federise_channel_metadata: ChannelStoreMetadata
// federise_channel_events: { channelId, ...ChannelStoreEvent }
```

## Service Worker Configuration

```typescript
interface LocalGatewayConfig {
  gatewayPath: string;           // Default: '/gateway'
  signingSecret: string;         // For local token signing
  corsOrigin: string;            // Default: '*'
}
```

## SDK Configuration

```typescript
// Point SDK at local gateway
const client = new FederiseClient({
  gatewayUrl: '/gateway',  // Intercepted by service worker
  // No API key needed for local
});

// Works exactly like remote gateway
await client.kv.set('mykey', 'myvalue');
const value = await client.kv.get('mykey');
```

## Capability Matrix

| Capability | Local Support | Notes |
|------------|---------------|-------|
| KV read/write | Full | IndexedDB |
| KV delete | Full | IndexedDB |
| Blob upload | Full | IndexedDB (size limits apply) |
| Blob download | Full | Object URLs or direct |
| Blob presign | Partial | Returns local URLs, not S3 presigned |
| Channel create | Full | IndexedDB |
| Channel append/read | Full | IndexedDB |
| Channel subscribe (SSE) | Partial | Polling only, no push |
| Channel subscribe (WS) | No | Requires server |
| Public blob URLs | Partial | Works within same origin only |

## Graceful Degradation

When a capability isn't available locally:
- Presign returns blob: or data: URLs instead of S3 presigned URLs
- Small files (<1MB) use data URLs
- Larger files use object URLs (require cleanup)

## Sync with Remote Gateway

```typescript
interface SyncOptions {
  localGateway: LocalGateway;
  remoteGateway: { url: string; apiKey: string };
  direction: 'push' | 'pull' | 'both';
}

interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: SyncConflict[];
}
```

## Storage Limits

| Browser | IndexedDB Limit | Notes |
|---------|-----------------|-------|
| Chrome | ~80% of disk | Per origin |
| Firefox | ~50% of disk | Per origin |
| Safari | ~1GB | Prompts for more |
| Edge | ~80% of disk | Per origin |

## Browser Extension Integration

Extensions can also run the local gateway by handling messages in the background script and routing them through the same gateway-core Hono app.

## Open Questions

1. **Auth model**: Skip auth locally, or implement local principal management?
2. **Encryption**: Encrypt data at rest in IndexedDB?
3. **Quota warnings**: How to handle approaching storage limits?
4. **Migration**: Import/export data between local and remote?
5. **Conflict resolution**: When syncing, how to handle conflicts?

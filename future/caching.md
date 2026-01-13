# Caching Architecture

## Current State

No caching exists at any layer. Every operation = full round trip to gateway.

**Impact:**
- KV get: ~30-80ms per request (even for same key)
- Log read: ~50-100ms per request (re-fetches all events)
- High latency for repeated access
- Unnecessary load on gateway
- Poor offline experience

## Where Should Caching Live?

### Option Analysis

| Location | Pros | Cons |
|----------|------|------|
| **Userland** | Full control, app-specific logic | Burden on developer, inconsistent |
| **SDK** | Automatic, consistent, opt-in | SDK complexity, memory management |
| **SDK ↔ Frame** | Shared across SDK instances | Complex, limited use case |
| **Frame** | Shared across apps | Privacy concerns, stale data |
| **Gateway** | Server-side, benefits all clients | Still requires network round trip |

### Recommendation: Multi-Layer Strategy

- **Userland**: Application-specific caching, state management, UI binding. Uses SDK hooks for cache invalidation. Examples: React Query, TanStack Query, Svelte stores.
- **SDK (Cache Layer)**: Opt-in caching with configurable strategies. Memory cache + optional persistence (IndexedDB). Handles invalidation, staleness, background refresh.
- **Frame/Proxy**: No caching (stateless mediator). Passes through requests with optional cache hints.
- **Gateway**: Returns cache metadata (ETags, version numbers). Supports conditional requests (If-None-Match). Optional server-side caching for hot paths.

## KV Caching

### Configuration

```typescript
interface KVCacheConfig {
  enabled: boolean;
  storage: 'memory' | 'indexeddb' | 'both';
  maxEntries?: number;           // LRU eviction
  maxAge?: number;               // TTL in ms
  strategy: 'cache-first' | 'network-first' | 'stale-while-revalidate';
  persistOnUnload?: boolean;
  restoreOnLoad?: boolean;
}
```

### Cache Strategies

**Cache-First**: Return cached value immediately if available, fetch from gateway only on miss.

**Stale-While-Revalidate**: Return stale data immediately, revalidate in background if stale.

**Write-Through**: Update cache immediately on write, persist to gateway, rollback on failure.

### Cache Invalidation

```typescript
interface CacheInvalidation {
  invalidate(key: string): void;
  invalidatePrefix(prefix: string): void;
  invalidateAll(): void;
  onWrite(key: string): void;
  onExternalChange?(key: string): void;
  setTTL(key: string, ttl: number): void;
  expireAt(key: string, timestamp: number): void;
}
```

## Log Caching

Logs are append-only, making caching more predictable. Only fetch events after `lastCachedSeq`.

### Configuration

```typescript
interface LogCacheConfig {
  enabled: boolean;
  storage: 'memory' | 'indexeddb' | 'both';
  maxEventsPerLog?: number;
  maxTotalEvents?: number;
  syncMode: 'manual' | 'poll' | 'realtime';
  pollInterval?: number;
  compactOnRead?: boolean;
}

interface LogCacheState {
  events: LogEvent[];
  lastSeq: number;
  lastSyncedAt: number;
  metadata?: LogMeta;
}
```

### Incremental Sync

Fetch only new events by passing `afterSeq` parameter. Merge with cached events.

### Real-Time Sync

When WebSocket support is added:
- Subscribe to log with `afterSeq` parameter
- Append incoming events to cache
- Detect gaps and trigger full resync

## Partial Updates (Delta Sync)

### Problem

Currently, every write is a full value replacement.

### Solutions

**Application-Level Patches**: SDK provides patch helpers (`applyPatch`, `createPatch`), app manages structure.

**Native Patch Operations**: Gateway supports atomic patches.

```typescript
await kv.patch('user', [
  { op: 'replace', path: '/lastSeen', value: new Date().toISOString() },
  { op: 'increment', path: '/visitCount', value: 1 }
]);
```

**CRDT-Based Merge**: For conflict-free concurrent edits using CRDT wrappers.

## Sync Engine Integration

### What is a Sync Engine?

A sync engine manages local state and syncs with a remote server:
- **Local-first**: Works offline, syncs when connected
- **Optimistic updates**: UI updates immediately
- **Conflict resolution**: Handles concurrent edits
- **Delta sync**: Only transfers changes

Examples: Replicache, TinyBase, Y.js, Automerge, PowerSync

### SDK as Sync-Engine-Friendly

Expose hooks for sync engines rather than building a full sync engine:

```typescript
interface SyncAdapter {
  push(changes: Change[]): Promise<PushResult>;
  pull(lastSyncId: string): Promise<PullResult>;
  subscribe(callback: (change: Change) => void): Unsubscribe;
}
```

### Minimal Sync Layer in SDK

For apps that don't want a full sync engine:

```typescript
interface SimpleSyncConfig {
  keys: string[] | ((key: string) => boolean);
  mode: 'eager' | 'lazy' | 'manual';
  conflictStrategy: 'last-write-wins' | 'merge' | 'custom';
  onConflict?: (local: any, remote: any) => any;
  persist: boolean;
}
```

## API Extensions for Caching

### Version Numbers / ETags

```typescript
interface KVGetResponse {
  key: string;
  value: string;
  version: number;
  etag: string;
  modifiedAt: string;
}
```

Conditional get returns 304 if unchanged.

### Bulk Operations

```typescript
// Single request, multiple keys
const values = await client.kv.bulkGet(['key1', 'key2', 'key3']);

// Single request, multiple writes
await client.kv.bulkSet([
  { key: 'key1', value: 'value1' },
  { key: 'key2', value: 'value2' }
]);
```

### Watch / Subscribe

```typescript
// Subscribe to key changes
const unsubscribe = client.kv.watch('user:*', (event) => {
  if (event.type === 'set') cache.set(event.key, event.value);
  else if (event.type === 'delete') cache.delete(event.key);
});

// Subscribe to log events
const unsubscribe = client.log.subscribe(logId, (event) => {
  cache.appendEvent(logId, event);
});
```

## Framework Integrations

### React

```typescript
import { useFederiseKV, useFederiseLog } from '@federise/react';

const { data: user, isLoading, mutate } = useFederiseKV<User>('user:profile', {
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  dedupingInterval: 2000,
});

const { events, isLoading, append } = useFederiseLog(logId, {
  subscribe: true,
  limit: 100,
});
```

### Svelte

```typescript
import { federiseKV, federiseLog } from '@federise/svelte';

const user = federiseKV<User>('user:profile', { cache: true });
const messages = federiseLog(logId, { subscribe: true, limit: 100 });
```

### Vue

```typescript
import { useFederiseKV, useFederiseLog } from '@federise/vue';

const { data: user, loading, error, mutate } = useFederiseKV('user:profile');
const { events, append, subscribe } = useFederiseLog(logId);
```

## Implementation Phases

### Phase 1: SDK Cache Layer
Opt-in cache configuration with memory and IndexedDB storage options.

### Phase 2: Gateway Cache Metadata
Gateway returns version info, supports conditional requests (If-None-Match, 304).

### Phase 3: Bulk Operations
New endpoints: `POST /kv/bulk/get`, `POST /kv/bulk/set`, `POST /log/bulk/read`.

### Phase 4: Real-Time Subscriptions
WebSocket for real-time updates (see logs.md).

### Phase 5: Framework Integrations
Separate packages: `@federise/react`, `@federise/svelte`, `@federise/vue`, `@federise/solid`.

## Cache Considerations

### Memory Management

```typescript
interface CacheMemoryConfig {
  maxMemoryMB?: number;
  maxEntries?: number;
  evictionPolicy: 'lru' | 'lfu' | 'fifo';
  onEviction?: (key: string, reason: string) => void;
  onMemoryWarning?: (usedMB: number, maxMB: number) => void;
}
```

### Persistence

```typescript
interface CachePersistenceConfig {
  dbName: string;
  storeName: string;
  persistOnUnload: boolean;
  restoreOnLoad: boolean;
  maxAge: number;
  compactOnRestore: boolean;
}
```

### Privacy

```typescript
interface CachePrivacyConfig {
  neverCache?: string[];
  encryptAtRest?: boolean;
  clearOnLogout?: boolean;
  clearOnTimeout?: number;
}
```

## Open Questions

1. **Cache key format**: Should SDK use same keys as gateway, or namespaced?
2. **Cross-tab sync**: Should cache be shared across browser tabs?
3. **Service worker**: Should cache live in service worker for offline?
4. **Compression**: Compress cached values to save memory?
5. **Encryption**: Encrypt sensitive cached data?
6. **Quota**: How to handle browser storage quotas?
7. **Metrics**: Should SDK report cache hit/miss rates?

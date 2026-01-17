# Hybrid Channel Architecture: Durable Objects + D1

## Current State

| Component | Cloudflare Gateway | Self-Hosted |
|-----------|-------------------|-------------|
| Channel Storage | Durable Objects | In-memory (planned: SQLite) |
| Realtime | SSE with 1s polling | SSE with 1s polling |
| Persistence | DO storage (per-object) | None (volatile) |

### Limitations

1. **SSE Polling**: Fixed 1-second interval creates constant load and latency
2. **No True Realtime**: Clients must poll; no push-based updates
3. **DO Storage Isolation**: Each log is a separate DO; no cross-log queries
4. **No Historical Search**: Can't query channels by content, date range, etc.

## Proposed Architecture

Use **Durable Objects for realtime** and **D1 for persistence**.

- D1 Database stores `channel_events` and `channel_metadata` (persistence, queries)
- Durable Object per channel room handles WebSocket connections, in-memory recent events, broadcast to subscribers, presence tracking
- Clients connect via WebSocket to DO for realtime, query D1 for history

## Data Flow

### Append (Write)
Client → DO.append(content) → Broadcast to all WebSocket clients (immediate) → Write to D1 (async, non-blocking)

### Subscribe (Realtime)
Client → DO.connect() via WebSocket → DO maintains connection → Push events as they arrive

### Read (History)
Client → Gateway → D1.query() → SELECT from channel_events WHERE channel_id = ? AND seq > ?

### Create Channel
Client → Gateway → D1: INSERT INTO channel_metadata → DO: Initialize (lazy, on first connection)

### Delete Channel
Client → Gateway → D1: DELETE channel_events and channel_metadata → DO: Cleanup and close connections

## D1 Schema

```sql
CREATE TABLE channel_metadata (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_namespace TEXT NOT NULL,
  secret TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX idx_channel_metadata_owner ON channel_metadata(owner_namespace);

CREATE TABLE channel_events (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  author_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (channel_id) REFERENCES channel_metadata(id),
  UNIQUE (channel_id, seq)
);

CREATE INDEX idx_channel_events_log_seq ON channel_events(channel_id, seq);
CREATE INDEX idx_channel_events_created ON channel_events(created_at);
```

## Durable Object State

```typescript
interface ChannelRoomDOState {
  connections: Map<WebSocket, { authorId: string }>;
  recentEvents: ChannelEvent[];  // Last N events for quick hydration
  nextSeq: number;
  db: D1Database;  // D1 binding for persistence
}
```

## IChannelStore Interface Changes

```typescript
interface IChannelStore {
  // Existing
  create(channelId: string, name: string, ownerNamespace: string, secret: string): Promise<ChannelStoreMetadata>;
  getMetadata(channelId: string): Promise<ChannelStoreMetadata | null>;
  append(channelId: string, options: ChannelAppendOptions): Promise<ChannelStoreEvent>;
  read(channelId: string, options?: ChannelReadOptions): Promise<ChannelStoreReadResult>;
  delete(channelId: string): Promise<void>;

  // New: Get WebSocket URL for realtime subscription
  getRealtimeUrl?(channelId: string): string;

  // New: Query with filters (D1-powered)
  query?(channelId: string, options: ChannelQueryOptions): Promise<ChannelStoreReadResult>;
}

interface ChannelQueryOptions {
  afterSeq?: number;
  beforeSeq?: number;
  authorId?: string;
  contentContains?: string;
  afterDate?: string;
  beforeDate?: string;
  limit?: number;
}
```

## Benefits

| Aspect | Current (DO-only) | Hybrid (DO + D1) |
|--------|------------------|------------------|
| Realtime latency | ~1000ms (polling) | <50ms (WebSocket push) |
| Connection efficiency | HTTP request per poll | Single persistent connection |
| Historical queries | Scan all events | SQL indexes |
| Cross-log search | Not possible | SQL JOIN/WHERE |
| Data durability | DO storage (per-object) | D1 (replicated) |
| Cost at scale | DO requests | D1 reads + DO connections |

## Consistency Model

**D1 is the source of truth.** DO is a realtime cache.

| Scenario | Handling |
|----------|----------|
| DO evicted | Reload `nextSeq` and recent events from D1 on wake |
| D1 write fails | Retry with exponential backoff; event already broadcast |
| Client reconnects | Hydrate from DO's recent buffer, then D1 for history |
| Read after write | Immediate via WebSocket; eventual via D1 query |

Events are assigned sequence numbers in the DO (single-threaded), ensuring strict ordering. D1 writes are async but use the same sequence, so historical reads are correctly ordered.

## Migration Path

1. **Phase 1**: Add D1 schema and dual-write (DO + D1) for new events
2. **Phase 2**: Add WebSocket support to DO, deprecate SSE polling
3. **Phase 3**: Migrate historical queries to D1
4. **Phase 4**: Remove SSE endpoint, update SDK

## Open Questions

1. **DO-D1 Binding**: Can a DO access D1 directly, or must it go through a Worker?
2. **Batch Writes**: Should DO buffer events and batch-write to D1?
3. **Retention Policy**: Auto-delete old events from D1? Configurable per-log?
4. **Self-Hosted Parity**: Use SQLite + in-process pub/sub for self-hosted?

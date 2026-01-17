# Federise Roadmap

This document provides a comprehensive listing of completed features and planned work. No timelines are provided; work is organized by capability area and priority.

## Completed

### Platform Core

- [x] **Gateway Core Package** (`@federise/gateway-core`)
  - [x] Adapter interfaces (`IKVStore`, `IBlobStore`, `IChannelStore`, `IPresigner`)
  - [x] KV endpoints: get, set, keys, bulk get/set, namespaces, dump
  - [x] Blob endpoints: upload, presign-upload, get, download, delete, list, visibility
  - [x] Channel endpoints: create, list, append, read, delete, token/create, subscribe (SSE)
  - [x] Principal endpoints: create, list, delete
  - [x] Auth middleware with API key validation
  - [x] HMAC signing for presigned URLs
  - [x] Capability tokens V1/V2/V3 formats
  - [x] Namespace aliasing for short URLs
  - [x] Zod schema validation
  - [x] OpenAPI spec generation via Chanfana

- [x] **Cloudflare Gateway** (`apps/gateway`)
  - [x] Cloudflare Workers deployment
  - [x] KV adapter for Cloudflare KV
  - [x] R2 adapter for blob storage
  - [x] Durable Objects adapter for channels
  - [x] R2 presigner for direct uploads

- [x] **Self-Hosted Gateway** (`apps/self`)
  - [x] Deno runtime with single binary (~98MB)
  - [x] Deno KV adapter (SQLite-backed)
  - [x] Filesystem blob adapter
  - [x] S3/MinIO blob adapter
  - [x] In-memory channel adapter

### Client SDK

- [x] **SDK Package** (`@federise/sdk`)
  - [x] FederiseClient (iframe-based, browser)
  - [x] ChannelClient (token-based, browser + Node.js)
  - [x] KV namespace API (get, set, delete, keys)
  - [x] Blob namespace API (upload, get, delete, list, setVisibility)
  - [x] Channel namespace API (create, list, append, read, delete, createToken)
  - [x] Upload progress tracking with XHR
  - [x] Presigned URL upload with fallback
  - [x] Capability token parsing (V1/V2/V3)
  - [x] Error classes (FederiseError, PermissionDeniedError, TimeoutError, ConnectionError)

### Organization App

- [x] **Org Admin Dashboard** (`apps/org`)
  - [x] Frame Enforcer (message broker between apps and gateway)
  - [x] Permission management (grant, revoke, list)
  - [x] Authorization flow with popup
  - [x] Gateway connection configuration
  - [x] Principal (API key) management
  - [x] Data browser (KV, Blob)
  - [x] Storage Access API handling for cross-site iframe
  - [x] Service worker for offline support

### Demo App

- [x] **Demo Application** (`apps/demo`)
  - [x] Chat room using Channel capability
  - [x] Token-based sharing
  - [x] SSE subscription polling
  - [x] Cross-gateway channel sharing

---

## Planned

### Hybrid Channel Architecture

See: `logs.md`

- [ ] **D1 Persistence Layer**
  - [ ] D1 schema for channel_metadata and channel_events tables
  - [ ] Dual-write from Durable Objects to D1
  - [ ] Historical query support with SQL indexes
  - [ ] Cross-channel search capability

- [ ] **WebSocket Realtime**
  - [ ] WebSocket support in Durable Objects
  - [ ] Replace SSE polling with push-based updates
  - [ ] Connection hydration from recent events buffer
  - [ ] Presence tracking per channel room

- [ ] **IChannelStore Interface Extensions**
  - [ ] `getRealtimeUrl(channelId)` for WebSocket URL
  - [ ] `query(channelId, options)` for filtered queries (date range, author, content search)

### Proxy Package Extraction

See: `proxy.md`

- [ ] **packages/proxy Package**
  - [ ] Extract Frame Enforcer logic to reusable package
  - [ ] `MessageRouter` for routing messages to backends
  - [ ] `ProxyBackend` interface (KV, Blob, Channel operations)
  - [ ] `CapabilityStore` interface

- [ ] **Transport Adapters**
  - [ ] `PostMessageTransport` for iframe communication
  - [ ] `ExtensionTransport` for browser extension messaging

- [ ] **Backend Implementations**
  - [ ] `RemoteBackend` wrapping HTTP client to gateway
  - [ ] `LocalBackend` using IndexedDB (see local.md)
  - [ ] `HybridBackend` combining local and remote with configurable strategy

- [ ] **Capability Store Implementations**
  - [ ] `CookieCapabilityStore` for iframe context
  - [ ] `ExtensionCapabilityStore` for chrome.storage.local
  - [ ] `IndexedDBCapabilityStore` for local-only scenarios

- [ ] **Browser Extension**
  - [ ] Background service worker with MessageRouter
  - [ ] Popup UI for capability approval
  - [ ] Content script for SDK shim injection
  - [ ] Cross-browser support (Chrome, Firefox, Safari)

### Local Gateway

See: `local.md`

- [ ] **packages/local Package**
  - [ ] Service worker entry point
  - [ ] gateway-core running in browser
  - [ ] Fetch interception for `/gateway/*` requests

- [ ] **IndexedDB Adapters**
  - [ ] `IndexedDBKVStore` implementing IKVStore
  - [ ] `IndexedDBBlobStore` implementing IBlobStore
  - [ ] `IndexedDBChannelStore` implementing IChannelStore

- [ ] **Local Features**
  - [ ] Data URL / Object URL presigning for blobs
  - [ ] Storage quota management
  - [ ] Persistence request (`navigator.storage.persist()`)

- [ ] **Sync with Remote**
  - [ ] Push local changes to remote gateway
  - [ ] Pull remote changes to local
  - [ ] Bidirectional sync with conflict handling

### Provider Configuration

See: `configure.md`

- [ ] **Provider Registry**
  - [ ] `IProvider` interface with capabilities discovery
  - [ ] `LocalProvider` using IndexedDB
  - [ ] `RemoteProvider` wrapping HTTP gateway
  - [ ] Provider CRUD (add, edit, remove, enable/disable)

- [ ] **Capability Router**
  - [ ] Per-capability routing to providers
  - [ ] Per-app routing configuration
  - [ ] Fallback chains with priority
  - [ ] Capability pattern matching (`kv:*`, `blob:read`)

- [ ] **Configuration Storage**
  - [ ] Cookie-based for iframe context
  - [ ] chrome.storage.sync for extension
  - [ ] IndexedDB for local-only

- [ ] **Configuration UI**
  - [ ] Provider management dashboard
  - [ ] Per-app routing configuration
  - [ ] Quick presets (Local Only, Cloud, Hybrid, Self-Hosted, Custom)

- [ ] **Provider Composition**
  - [ ] Tiered storage (hot/warm/cold)
  - [ ] Replicated storage (primary + replicas)
  - [ ] Encrypted provider wrapper

### Authentication & Authorization

See: `auth.md`

- [ ] **Token V4 System**
  - [ ] Universal token structure supporting all use cases
  - [ ] Token types: API_KEY, RESOURCE_TOKEN, SHARE_TOKEN, REFRESH_TOKEN, SESSION_TOKEN
  - [ ] Expiry types: TIMED, SLIDING, FOREVER, ONE_TIME, N_TIMES
  - [ ] Per-token rate limits and quotas
  - [ ] Token creation API

- [ ] **API Key Management**
  - [ ] Multiple keys per principal
  - [ ] Key rotation with grace period (both keys work during transition)
  - [ ] Key scoping to specific capabilities
  - [ ] Key expiry and auto-rotation policy
  - [ ] Key management API (create, revoke, list)

- [ ] **Token Revocation**
  - [ ] Revocation list storage (`__REVOKED:*` keys)
  - [ ] Revocation check in verification flow
  - [ ] Revoke single token or all tokens
  - [ ] Cleanup job for expired revocation entries

- [ ] **Rate Limiting**
  - [ ] Per-principal limits (requests/minute, requests/hour, burst)
  - [ ] Per-token limits (can be lower than principal)
  - [ ] Per-operation limits (blob:upload, channel:append)
  - [ ] Rate limit headers (X-RateLimit-*)
  - [ ] Durable Object rate limiter for Cloudflare
  - [ ] In-memory rate limiter for self-hosted

- [ ] **Blob Tokens**
  - [ ] Token-based blob access (like log tokens)
  - [ ] One-time download URLs
  - [ ] N-times download limits
  - [ ] Download counting and tracking
  - [ ] Password-protected downloads

- [ ] **Channel Token Enhancements**
  - [ ] Sequence range restrictions
  - [ ] Max reads/writes limits
  - [ ] Forever tokens for public channels

- [ ] **Bearer Token Support**
  - [ ] `Authorization: Bearer {token}` header
  - [ ] Backwards compatible with existing formats

- [ ] **App-Level Configuration**
  - [ ] Per-app rate limits
  - [ ] Per-app resource restrictions (key patterns, channel IDs)
  - [ ] Per-app token policy (max expiry, allowed types)

- [ ] **Audit Logging**
  - [ ] Audit event schema
  - [ ] Audit storage (log, webhook, KV)
  - [ ] Configurable retention
  - [ ] Action filtering (include/exclude)

### Permissions Architecture

See: `permissions.md`

- [ ] **Namespace Redesign**
  - [ ] Namespace types: APP, USER, SHARED, PUBLIC, SYSTEM, NAMED
  - [ ] Readable namespace names (`app:a1b2c3d4` instead of 64-char hash)
  - [ ] Sub-namespace support (`app:abc/cache`, `app:abc/user`)
  - [ ] Namespace ownership tracking

- [ ] **Permission Model**
  - [ ] Fine-grained permissions (resource, namespace, keys, operations)
  - [ ] Key pattern matching (`user:*`, `config/*`)
  - [ ] Permission grants with constraints (expiry, max uses, IP allowlist)

- [ ] **Multi-Layer Enforcement**
  - [ ] Gateway namespace enforcement (not just trust proxy)
  - [ ] Defense in depth (SDK hints → Proxy first line → Gateway authoritative)

- [ ] **Cross-App Sharing**
  - [ ] Namespace sharing API
  - [ ] Share namespace request/approval flow
  - [ ] Accessing shared namespaces in SDK

- [ ] **Global/Shared Namespaces**
  - [ ] Public namespaces (readable by any app)
  - [ ] Shared namespaces (explicit membership)
  - [ ] System namespaces (platform reserved)

- [ ] **Admin Access**
  - [ ] Admin roles (SUPER_ADMIN, NAMESPACE_ADMIN, USER_ADMIN, AUDIT_ADMIN, READ_ONLY_ADMIN)
  - [ ] Admin grants with scope
  - [ ] Admin capabilities

- [ ] **Safeguards**
  - [ ] Privilege escalation prevention
  - [ ] Rate limiting by permission level
  - [ ] Dangerous operation protections
  - [ ] Permission expiry and review policy

- [ ] **Updated Capability Set**
  - [ ] Split `channel:create` into `channel:read`, `channel:write`, `channel:create`, `channel:share`
  - [ ] Add `kv:list`, `blob:list`
  - [ ] Add namespace capabilities: `namespace:list`, `namespace:create`, `namespace:share`, `namespace:admin`
  - [ ] Add cross-app capabilities: `cross:read`, `cross:write`

### Component Responsibilities

See: `responsibilities.md`

- [ ] **SDK Improvements**
  - [ ] Transport abstraction (IframeTransport, ExtensionTransport, DirectTransport, LocalTransport)
  - [ ] Namespace-aware API (`client.namespace('shared:team')`)
  - [ ] Remove hardcoded frame URL
  - [ ] Add offline support
  - [ ] Add request batching

- [ ] **Proxy Improvements**
  - [ ] Extract from org app to reusable package
  - [ ] Add rate limiting
  - [ ] Add granular permissions
  - [ ] Add user visibility (what apps are doing)
  - [ ] Named/manageable namespaces
  - [ ] Cross-app collaboration support

- [ ] **Gateway Improvements**
  - [ ] Namespace enforcement (validate access, not trust proxy)
  - [ ] Audit logging
  - [ ] Rate limiting
  - [ ] Universal token system (blobs, KV, not just channels)

- [ ] **User Control Panel**
  - [ ] View all apps with permissions
  - [ ] View what each app can access
  - [ ] View recent activity per app
  - [ ] Revoke permissions individually
  - [ ] Set rate limits per app
  - [ ] Export user data
  - [ ] Delete all data for an app

### Caching Architecture

See: `caching.md`

- [ ] **SDK Cache Layer**
  - [ ] Opt-in caching configuration
  - [ ] Memory cache with LRU eviction
  - [ ] IndexedDB persistence
  - [ ] Cache strategies: cache-first, network-first, stale-while-revalidate
  - [ ] Write-through caching with rollback

- [ ] **KV Caching**
  - [ ] Cache configuration per-key or global
  - [ ] TTL and expiry management
  - [ ] Invalidation API (key, prefix, all)

- [ ] **Log Caching**
  - [ ] Incremental sync (only fetch events after lastSeq)
  - [ ] Event compaction on read
  - [ ] Real-time sync when WebSocket available
  - [ ] Gap detection and resync

- [ ] **Partial Updates (Delta Sync)**
  - [ ] SDK patch helpers (`applyPatch`, `createPatch`)
  - [ ] Native patch operations in gateway
  - [ ] CRDT-based merge for conflict-free edits

- [ ] **Sync Engine Integration**
  - [ ] SyncAdapter interface (push, pull, subscribe)
  - [ ] Minimal sync layer in SDK
  - [ ] Compatible with Replicache, TinyBase, Y.js, etc.

- [ ] **API Extensions for Caching**
  - [ ] Version numbers / ETags on KV responses
  - [ ] Conditional GET (If-None-Match, 304)
  - [ ] Bulk operations (bulkGet, bulkSet for multiple keys)
  - [ ] Watch/subscribe for key changes

- [ ] **Framework Integrations**
  - [ ] `@federise/react` with useFederiseKV, useFederiseChannel hooks
  - [ ] `@federise/svelte` with federiseKV, federiseChannel stores
  - [ ] `@federise/vue` with composables
  - [ ] `@federise/solid` with primitives

- [ ] **Cache Considerations**
  - [ ] Memory management (max size, eviction policy)
  - [ ] Persistence configuration
  - [ ] Privacy controls (never-cache keys, encrypt at rest, clear on logout)

---

## Known Issues to Address

From `CROSS-CUTTING-CONCERNS.md`:

### Security

- [ ] SEC-001: Encrypt API keys in localStorage
- [ ] SEC-002: Remove/gate test endpoints in production
- [ ] SEC-003: Move bootstrap key to Cloudflare secrets
- [ ] SEC-004: Add Referrer-Policy for token URLs
- [ ] SEC-005: Rate limiting on auth endpoints
- [ ] Add CSRF tokens to permission grant flow
- [ ] Add audit logging for permission changes
- [ ] Implement token revocation mechanism
- [ ] API key rotation mechanism

### Performance

- [ ] BUG-005: Channel sharding for high-throughput (single DO bottleneck)
- [ ] BUG-006: Add SSE heartbeat
- [ ] BUG-009: Fix N+1 principal listing
- [ ] BUG-012: Adaptive SSE polling intervals
- [ ] True streaming for self-hosted uploads
- [ ] Batch KV writes for metadata
- [ ] Cursor-based pagination

### Bugs

- [ ] BUG-001: Namespace alias collision handling
- [ ] BUG-002: Graceful shutdown in self-hosted
- [ ] BUG-003: Memory exhaustion on large uploads (self-hosted)
- [ ] BUG-004: Presigned URL orphaned metadata
- [ ] BUG-007: KV delete uses empty string
- [ ] BUG-008: Presigned bucket string matching (self-hosted)

### SDK

- [ ] BUG-011: Request retry logic
- [ ] BUG-013: Batch operations
- [ ] BUG-014: Client-side caching layer
- [ ] Request cancellation for uploads
- [ ] Concurrent request limits

# Component Responsibilities & Architecture

## Overview

Federise provides backend-as-a-service primitives for frontend applications where users provide their backend in a scoped way, never giving apps full unprivlidged acccess. The goal is to expose capabilities generically and without opinion, enabling third-party apps to function without their own backend.

## Layer Architecture

**Userland → SDK → Proxy/Frame → Gateway → Storage**

Each layer has specific responsibilities and boundaries.

## Layer Responsibilities

### Userland (Third-Party Apps)

**What it is:**
- Web applications built by developers using Federise
- Have no backend of their own
- Use Federise capabilities as building blocks

**Responsibilities:**
- Implement application logic
- Request only capabilities they need
- Handle errors gracefully
- Respect user data and privacy

**Should NOT:**
- Know about internal protocol details
- Need to understand namespace hashing
- Handle authentication complexity
- Care about which gateway or storage backend is used

### SDK (`@federise/sdk`)

**What it is:**
- Client-side JavaScript/TypeScript library
- Provides typed API for all capabilities
- Abstracts transport layer (iframe, extension, direct HTTP)

**Current Responsibilities:**

| Responsibility | Implementation |
|----------------|----------------|
| Type-safe API | TypeScript interfaces for all operations |
| Connection management | iframe lifecycle, postMessage handling |
| Capability checking | `ensureCapability()` before operations |
| Error transformation | Convert protocol errors to typed exceptions |
| Upload handling | Presigned URL + fallback, progress tracking |

**Should Be Responsible For:**
- Providing a clean, ergonomic API
- Handling retries and timeouts
- Client-side caching (opt-in)
- Request batching and deduplication
- Multiple transport adapters (iframe, extension, direct)

**Should NOT:**
- Enforce security (client-side, can be bypassed)
- Make policy decisions
- Know about storage implementation
- Handle authentication (that's proxy/gateway's job)

**Current Issues:**
1. Hardcoded frame URL (`https://federise.org/frame`)
2. No transport abstraction (iframe-only for FederiseClient)
3. No offline support
4. No request batching
5. Test methods (`_testGrantPermissions`) in production code

### Proxy / Frame

**What it is:**
- Mediator between apps and gateway
- Runs in a trusted context (federise.org iframe or browser extension)
- Enforces user-granted permissions

**Current Responsibilities:**

| Responsibility | Implementation |
|----------------|----------------|
| Origin verification | Verify `event.origin` matches registered app |
| Permission enforcement | Check `hasCapability(origin, cap)` before forwarding |
| Namespace resolution | Hash origin to create isolated namespace |
| User consent flow | Redirect to `/authorize` for permission approval |
| Storage access handling | Request storage access in cross-site context |
| Message routing | Forward requests to appropriate gateway endpoints |

**Should Be Responsible For:**
- **User consent**: All permission grants require explicit user approval
- **App isolation**: Each app gets isolated namespace by default
- **Rate limiting**: Protect gateway from abusive apps
- **Request logging**: Audit trail for user visibility
- **Policy enforcement**: Apply user-configured restrictions

**Should NOT:**
- Store data directly (delegate to gateway)
- Make authentication decisions (gateway validates credentials)
- Be the only enforcement point (defense in depth)

**Current Issues:**
1. **Tightly coupled to org app** - Lives in `apps/org`, not reusable
2. **No rate limiting** - Apps can spam requests
3. **No granular permissions** - All-or-nothing per capability
4. **No user visibility** - Users can't see what apps are doing
5. **Namespace is opaque** - Users can't name or manage namespaces
6. **No cross-app sharing** - Apps isolated by design, can't collaborate

### Gateway (`@federise/gateway-core` + implementations)

**What it is:**
- Backend HTTP API providing storage primitives
- Environment-agnostic core with runtime-specific adapters
- Handles authentication and authorization

**Current Responsibilities:**

| Responsibility | Implementation |
|----------------|----------------|
| API key authentication | Validate `Authorization: ApiKey {key}` header |
| Token authentication | Verify HMAC-signed tokens for logs/blobs |
| Storage abstraction | `IKVStore`, `IBlobStore`, `IChannelStore` interfaces |
| Business logic | Create, read, update, delete operations |
| URL signing | Presigned URLs for direct upload/download |

**Should Be Responsible For:**
- **Authentication**: Validate all credentials
- **Authorization**: Enforce fine-grained permissions
- **Storage operations**: All data access goes through adapters
- **Audit logging**: Track all operations for compliance
- **Rate limiting**: Protect against abuse
- **Namespace enforcement**: Validate namespace access (not just trust proxy)

**Should NOT:**
- Know about specific apps or origins
- Make UI decisions
- Handle user consent (that's proxy's job)
- Be environment-specific (use adapters)

**Current Issues:**
1. **No namespace enforcement** - Gateway trusts any namespace passed by caller
2. **Principal has full access** - API key grants access to everything
3. **No audit logging** - Operations not tracked
4. **No rate limiting** - No protection against abuse
5. **Limited token system** - Only logs have tokens, not blobs/KV

## Current Opinions & Constraints

### Opinions We're Imposing

| Opinion | Impact | Should Change? |
|---------|--------|----------------|
| **Origin-based isolation** | Apps can't share data | Yes - add opt-in sharing |
| **SHA-256 namespace hashing** | Namespaces are opaque, unreadable | Yes - add readable names |
| **Capabilities are coarse** | kv:write grants write to ALL keys | Yes - add key patterns |
| **Frame is single source** | Must use federise.org frame | Yes - configurable proxy |
| **Channels require channel:create for everything** | Can't have read-only channel access | Yes - split into read/write |
| **No data portability** | Users can't export their data | Yes - add export capability |
| **Presigned URLs only** | No direct streaming downloads | Maybe - security tradeoff |
| **JSON-only KV values** | SDK treats values as strings | Keep - simplicity |
| **Single namespace per app** | Apps can't organize data | Yes - sub-namespaces |

### Constraints We Should Keep

| Constraint | Reason |
|------------|--------|
| **User consent required** | Privacy and security |
| **HMAC-signed tokens** | Cryptographic integrity |
| **Namespace isolation by default** | Security boundary |
| **Server-side auth validation** | Can't trust client |
| **Capability-based access** | Least privilege |

## What's Missing

### Missing Permissions

| Permission | Description | Use Case |
|------------|-------------|----------|
| `kv:list` | List keys without reading values | Show key browser |
| `channel:read` | Read channels without write | Read-only channel access |
| `channel:write` | Append without create | Write to existing channels |
| `channel:share` | Create share tokens | Sharing without full access |
| `blob:list` | List blobs without reading | File browser |
| `blob:share` | Create share tokens | Share individual files |
| `namespace:list` | List accessible namespaces | Namespace browser |
| `namespace:create` | Create named namespaces | Data organization |
| `namespace:share` | Share namespace with other apps | Cross-app collaboration |
| `namespace:export` | Export all data | Data portability |
| `quota:read` | Read usage stats | Show usage to user |
| `audit:read` | Read access logs | Transparency |

### Missing Capabilities

| Capability | Description |
|------------|-------------|
| **Sub-namespaces** | `app:abc/cache`, `app:abc/user` |
| **Namespace aliasing** | User-friendly names |
| **Cross-app access** | Share data between apps |
| **Global namespaces** | `public:*`, `shared:*` |
| **Key patterns** | `kv:write(user:*)` - write only matching keys |
| **Usage quotas** | Limit storage per app |
| **Webhook events** | Notify on data changes |
| **Data export** | User downloads their data |
| **Audit visibility** | User sees what apps accessed |

## Proposed Changes

### 1. SDK: Transport Abstraction

```typescript
const client = new FederiseClient({
  transport: new IframeTransport({ url: 'https://federise.org/frame' })
  // OR
  transport: new ExtensionTransport()
  // OR
  transport: new DirectTransport({ gatewayUrl, apiKey })
  // OR
  transport: new LocalTransport()
});
```

### 2. SDK: Namespace-Aware API

```typescript
// Default namespace (backwards compatible)
await client.kv.get('mykey');

// Access other namespaces (if granted)
const shared = await client.namespace('shared:team');
await shared.kv.get('settings');

// Sub-namespaces
const cache = await client.namespace('app:abc/cache');
await cache.kv.set('temp', 'data');
```

### 3. Proxy: Granular Permissions

```typescript
interface Permission {
  resource: 'kv' | 'blob' | 'log' | 'namespace';
  namespace: string | string[];
  keys?: string | string[];
  operations: Operation[];
}
```

### 4. Proxy: User Control Panel

Users should be able to:
- See all apps with granted permissions
- See what each app can access
- See recent activity per app
- Revoke permissions individually
- Set rate limits per app
- Export their data
- Delete all data for an app

### 5. Gateway: Namespace Enforcement

Gateway validates namespace access, not just trusts proxy.

### 6. Gateway: Universal Token System

```typescript
// Tokens for any resource
const blobToken = await client.blob.createToken(key, { operations: ['read'], maxDownloads: 1 });
const kvToken = await client.kv.createToken(['user:*'], { operations: ['read'] });
const namespaceToken = await client.namespace.createToken('app:abc/public', { operations: ['read'] });
```

## Enforcement Matrix

Where should each check happen?

| Check | SDK | Proxy | Gateway |
|-------|-----|-------|---------|
| Request format validation | Yes | Yes | Yes |
| Capability check | Hint | Yes | Yes |
| Namespace access | - | Yes | Yes |
| Key pattern matching | - | Yes | Yes |
| Rate limiting | - | Yes | Yes |
| API key validation | - | - | Yes |
| Token validation | - | - | Yes |
| Quota enforcement | - | - | Yes |
| Audit logging | - | Yes | Yes |

**Principle: Defense in Depth**
- SDK checks are hints (improve UX, can be bypassed)
- Proxy checks are first line (user consent, app isolation)
- Gateway checks are authoritative (server-side, can't be bypassed)

## Generic Primitives

### KV (Key-Value Store)
- **Purpose**: Store and retrieve arbitrary string data by key
- **Generic**: No assumptions about data format, structure, or usage
- **Not Generic**: Currently assumes single namespace per app
- **Fix**: Add sub-namespaces, key patterns, cross-app access

### Blob (Object Storage)
- **Purpose**: Store and retrieve binary files
- **Generic**: Any file type, any size, any structure
- **Not Generic**: Visibility model (public/presigned/private) is opinionated
- **Fix**: Make visibility just one of many access policies

### Channel (Append-Only Event Stream)
- **Purpose**: Ordered, append-only event storage
- **Generic**: Any content, any author, any use case
- **Not Generic**: channel:create bundles create/read/write/share
- **Fix**: Split into granular permissions

### Namespace
- **Purpose**: Isolated data boundary
- **Generic**: Should be any grouping the user wants
- **Not Generic**: Currently tied to origin, opaque, no hierarchy
- **Fix**: Named namespaces, sub-namespaces, user-managed

## Implementation Priority

### Phase 1: Split Permissions
1. Split `channel:create` into `channel:read`, `channel:write`, `channel:create`, `channel:share`
2. Add `kv:list`, `blob:list`
3. Update SDK, proxy, and authorization flow

### Phase 2: Gateway Enforcement
1. Add namespace access validation to gateway
2. Add audit logging
3. Add rate limiting

### Phase 3: Namespace Improvements
1. Add readable namespace names
2. Add sub-namespace support
3. Update storage schema

### Phase 4: Cross-App Features
1. Add namespace sharing
2. Add cross-app permissions
3. Update proxy to handle multi-namespace grants

### Phase 5: User Control
1. Build permission management UI
2. Add activity/audit visibility
3. Add data export capability

## Open Questions

1. **Trust boundary**: Should gateway fully trust proxy, or validate everything?
2. **Token scope**: Should one token grant access to multiple resources?
3. **Offline first**: How do permissions work when offline?
4. **Migration**: How to migrate existing data to new namespace format?
5. **Revocation**: How quickly must permission revocations take effect?
6. **Audit retention**: How long to keep audit logs?
7. **Quota allocation**: Who decides how much storage each app gets?

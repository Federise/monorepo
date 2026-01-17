# apps/org - Organization Admin Dashboard

## Overview

The Org application is the user-facing administration dashboard for the Federise platform. It provides gateway deployment, permission management, principal (API key) management, and data browsing capabilities. The app also hosts the Frame Enforcer component that brokers communication between third-party applications and the gateway.

## Technical Specifications

| Aspect | Value |
|--------|-------|
| Framework | Astro 5.16.6 + Svelte 5.2.9 |
| Runtime | Cloudflare Workers (via @astrojs/cloudflare) |
| Package | `federise-org` |
| Entry Point | `astro.config.mjs` |
| Deployment | Cloudflare Pages |

## Architecture

### Page Structure

```
src/pages/
├── index.astro              # Landing page
├── start.astro              # Gateway deployment wizard
├── authorize.astro          # OAuth-style permission grants
├── frame.astro              # Frame Enforcer (iframe target)
├── offline.astro            # Offline fallback
└── manage/
    ├── index.astro          # Redirects to connection
    ├── connection.astro     # Gateway configuration
    ├── overview.astro       # Gateway statistics
    ├── permissions.astro    # App permissions UI
    ├── data.astro           # Storage browser
    ├── principals.astro     # API key management
    ├── settings.astro       # User preferences
    └── recovery.astro       # Account recovery
```

### Component Architecture

```
src/components/
├── FrameEnforcer.svelte     # Core message broker (717 lines)
├── AuthorizeFlow.svelte     # Permission request dialog
├── DeployFlow.svelte        # Worker deployment wizard
├── LoginButton.svelte       # Auth navigation
├── CtaButton.svelte         # Call-to-action button
└── manage/
    ├── Sidebar.svelte       # Navigation sidebar
    ├── Permissions.svelte   # App permissions UI
    ├── PrincipalsManager.svelte # API key CRUD
    ├── GatewayConnection.svelte # Gateway config
    ├── GatewayOverview.svelte   # Stats display
    ├── DataBrowser.svelte   # KV/Blob browser
    ├── Settings.svelte      # User settings
    ├── Recovery.svelte      # Account recovery
    └── Toast.svelte         # Notifications
```

### Library Architecture

```
src/lib/
├── protocol.ts              # Message types, capabilities
├── permissions.ts           # Permission storage
├── kv-storage.ts            # KV operations
├── blob-storage.ts          # Blob operations
└── channel-storage.ts       # Channel operations

src/utils/
└── auth.ts                  # Credential management

src/api/
├── client.ts                # OpenAPI client factory
└── schema.ts                # Auto-generated types
```

## Frame Enforcer

### Purpose

The Frame Enforcer (`FrameEnforcer.svelte`) is the central message router between embedded iframes (third-party apps using @federise/sdk) and the Federise gateway. It enforces permission checks and proxies all storage operations.

### Message Flow

```
Third-Party App → iframe → postMessage → Frame Enforcer
                                              ↓
                                      Permission Check
                                              ↓
                                      Gateway API Call
                                              ↓
                                      postMessage Response
                                              ↓
Third-Party App ←──────────────────────── Response
```

### Supported Operations

| Category | Operations |
|----------|------------|
| Connection | SYN, ACK, REQUEST_CAPABILITIES |
| KV | GET, SET, DELETE, LIST_KEYS |
| Blob | UPLOAD, GET_BLOB, DELETE_BLOB, LIST_BLOBS, GET_UPLOAD_URL, SET_VISIBILITY |
| Channel | CREATE, LIST, APPEND, READ, DELETE, CREATE_TOKEN |
| Test | TEST_GRANT_PERMISSIONS, TEST_CLEAR_PERMISSIONS |

### Permission Enforcement

```typescript
// FrameEnforcer.svelte:123-130
async function handleKVGet(source, origin, msg) {
  if (!(await hasCapability(origin, 'kv:read'))) {
    sendResponse(source, origin, {
      type: 'PERMISSION_DENIED',
      id: msg.id,
      capability: 'kv:read',
    });
    return;
  }
  // Proceed with operation
}
```

### Message Validation

```typescript
// FrameEnforcer.svelte:558-568
async function handleMessage(event: MessageEvent): Promise<void> {
  // Ignore messages from self
  if (event.origin === window.location.origin) return;

  // Validate message structure
  if (!isValidRequest(event.data)) {
    if (event.data?.id) {
      sendError(event.source, event.origin, event.data.id, 'INVALID_MESSAGE', ...);
    }
    return;
  }
}
```

## Permission System

### Permission Storage

```typescript
// permissions.ts:5-6
const PERMISSION_NAMESPACE = '__ORG';
const PERMISSION_KEY = 'permissions';

// Storage format in KV
{
  "https://example.com": {
    "origin": "https://example.com",
    "capabilities": ["kv:read", "kv:write"],
    "grantedAt": "2025-01-13T...",
    "expiresAt": "2026-01-13T..."  // Optional
  }
}
```

### Permission Record

```typescript
interface PermissionRecord {
  origin: string;
  capabilities: Capability[];
  grantedAt: string;
  expiresAt?: string;
}
```

### Permission Operations

| Function | Description |
|----------|-------------|
| `getPermissions(origin)` | Get capabilities for origin |
| `hasCapability(origin, cap)` | Check specific capability |
| `grantCapabilities(origin, caps)` | Add capabilities (additive merge) |
| `revokePermissions(origin)` | Remove all capabilities |
| `getAllPermissions()` | List all origins with permissions |

### Authorization Flow

```
1. App requests capabilities via SDK
   ↓
2. Frame Enforcer checks stored permissions
   ↓
3. If not granted: AUTH_REQUIRED response with URL
   URL: /authorize?app_origin={origin}&scope={capabilities}
   ↓
4. User redirected to authorize page
   ↓
5. User reviews and approves capabilities
   ↓
6. Permissions stored in KV
   ↓
7. Popup closes, app retries request
   ↓
8. Frame Enforcer allows operation
```

## Credential Management

### Storage Strategy

```typescript
// auth.ts:16-20
const STORAGE_KEY_API = 'federise:gateway:apiKey';
const STORAGE_KEY_URL = 'federise:gateway:url';
const COOKIE_KEY_API = 'federise_gateway_apiKey';
const COOKIE_KEY_URL = 'federise_gateway_url';
```

**Multi-tier Approach:**
1. **Top-level context:** localStorage (direct access)
2. **Iframe context:** Cookies via Storage Access API
3. **Fallback:** Unpartitioned storage → Cookies → localStorage

### Cookie Configuration

```typescript
// auth.ts:41-51
const isSecure = window.location.protocol === 'https:';
const cookieOptions = isSecure
  ? 'SameSite=None; Secure'      // Cross-origin iframe
  : 'SameSite=Lax';              // Dev mode (no Secure)
```

### Storage Access API

```typescript
// auth.ts:102-163
async function requestStorageAccess(): Promise<void> {
  // Request unpartitioned storage for iframe context
  if ('requestStorageAccessFor' in document) {
    // Newer API
    await document.requestStorageAccessFor(window.location.origin);
  } else if ('requestStorageAccess' in document) {
    // Standard API
    await document.requestStorageAccess();
  }
}
```

## Gateway Integration

### API Client

```typescript
// api/client.ts
import createClient from 'openapi-fetch';
import type { paths } from './schema';

export function createGatewayClient(baseUrl: string) {
  return createClient<paths>({ baseUrl });
}

export function withAuth(apiKey: string) {
  return {
    params: {
      header: { authorization: `ApiKey ${apiKey}` }
    }
  } as const;
}
```

### Storage Operations

```typescript
// kv-storage.ts
export async function getKV(origin: string, key: string): Promise<string | null> {
  const namespace = await buildNamespace(origin);  // SHA-256 hash
  const { data } = await client.POST('/kv/get', {
    ...withAuth(apiKey),
    body: { namespace, key }
  });
  return data?.value ?? null;
}

// blob-storage.ts
export async function uploadBlob(
  origin: string,
  key: string,
  data: ArrayBuffer,
  options: { contentType: string; visibility?: BlobVisibility }
): Promise<BlobMetadata | null> {
  // Try presigned URL first
  const presignResult = await getPresignedUploadUrl(...);
  if (presignResult) {
    // Direct upload to R2/S3
    await fetch(presignResult.uploadUrl, { method: 'PUT', body: data });
  } else {
    // Fallback: upload through gateway
    await client.POST('/blob/upload', { body: data });
  }
}
```

## Security Considerations

### Vulnerabilities

| ID | Severity | Description | Location |
|----|----------|-------------|----------|
| SEC-001 | HIGH | API keys stored unencrypted in localStorage | `auth.ts:265-270` |
| SEC-002 | HIGH | Test endpoints accessible in dev mode | `FrameEnforcer.svelte:530` |
| SEC-003 | MEDIUM | No CSRF protection on permission grants | `AuthorizeFlow.svelte:38-51` |
| SEC-004 | MEDIUM | Storage Access API fallback assumes success | `auth.ts:138-143` |
| SEC-005 | LOW | No input validation on principal names | `PrincipalsManager.svelte:43-58` |

### Test Endpoint Exposure

```typescript
// FrameEnforcer.svelte:524-556
async function handleTestGrantPermissions(...) {
  // Only allow test harness origin in development
  if (import.meta.env.DEV && origin === 'http://localhost:5174') {
    await grantCapabilities(origin, msg.capabilities);
    // ...
  }
}
```

**Risk:** If `import.meta.env.DEV` is misconfigured in build, test endpoints could be exposed in production.

### Origin Isolation

```typescript
// kv-storage.ts:21-28
async function buildNamespace(origin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(origin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `origin_${hashHex}`;
}
```

**Guarantee:** Each origin gets unique namespace, preventing cross-origin data access.

## Performance Characteristics

### Frame Enforcer Performance

| Operation | Latency | Bottleneck |
|-----------|---------|------------|
| postMessage handling | <1ms | JavaScript |
| Permission check | 10-30ms | KV lookup |
| KV operation | 20-50ms | Gateway API |
| Blob upload | 50-500ms | Upload size |

### Optimization Strategies

1. **Permission caching:** Permissions cached after first lookup
2. **Presigned uploads:** Bypass gateway for large files
3. **Batch operations:** KV bulk get/set supported

## Deployment

### Wrangler Configuration

```jsonc
// wrangler.jsonc
{
  "name": "federise-org",
  "main": "./dist/_worker.js/index.js",
  "compatibility_date": "2025-12-24",
  "compatibility_flags": [
    "nodejs_compat",
    "global_fetch_strictly_public"
  ],
  "assets": { "directory": "./dist" },
  "observability": { "enabled": true }
}
```

### Build Process

```bash
# Development
pnpm dev

# Production build
pnpm build

# Deploy
pnpm deploy
```

### Service Worker

The app includes a custom service worker for offline capabilities:

```bash
# Build service worker
cd service-worker && rollup -c

# Output: public/sw.js
```

## Known Issues

### Critical

| Issue | Description | Location |
|-------|-------------|----------|
| Unencrypted Credentials | API keys in localStorage | `auth.ts` |
| Test Endpoints | May be accessible in prod | `FrameEnforcer.svelte` |

### High Priority

| Issue | Description | Location |
|-------|-------------|----------|
| No CSRF Protection | Permission grants vulnerable | `AuthorizeFlow.svelte` |
| Missing Audit Log | No permission change tracking | `permissions.ts` |
| KV Delete Bug | Uses empty string instead of delete | `kv-storage.ts:75-80` |

### Medium Priority

| Issue | Description | Location |
|-------|-------------|----------|
| No Rate Limiting | Permission operations unlimited | `permissions.ts` |
| Storage Access Fallback | Assumes success without verification | `auth.ts:138-143` |
| No Pagination | Large permission lists not paginated | `permissions.ts` |

## Recommendations

### Security

1. **Encrypt stored credentials** using Web Crypto API
2. **Remove test endpoints** from production builds
3. **Add CSRF tokens** to permission grant flow
4. **Implement audit logging** for permission changes

### Performance

5. **Add permission caching** with TTL
6. **Implement batch permission checks** for multiple capabilities
7. **Add lazy loading** for manage pages

### User Experience

8. **Add confirmation dialogs** for destructive operations
9. **Implement progressive disclosure** for complex features
10. **Add offline indicators** for connection status

## Dependencies

### Production

| Package | Version | Purpose |
|---------|---------|---------|
| @astrojs/cloudflare | ^12.5.0 | Cloudflare adapter |
| @astrojs/svelte | ^7.0.9 | Svelte integration |
| @federise/sdk | workspace:* | SDK types |
| astro | ^5.16.6 | Framework |
| openapi-fetch | ^0.13.3 | Type-safe API client |
| svelte | ^5.2.9 | UI components |

### Development

| Package | Version | Purpose |
|---------|---------|---------|
| typescript | ^5.9.3 | Type checking |
| wrangler | ^4.54.0 | Deployment CLI |
| openapi-typescript | ^7.6.1 | Schema generation |

# Authentication & Authorization Architecture

## Current State

| Layer | Mechanism | Strengths | Weaknesses |
|-------|-----------|-----------|------------|
| **Principal (API Key)** | 64-char hex, SHA-256 hashed | Secure generation, no plaintext storage | No rotation, no scoping, no rate limits |
| **Log Tokens** | HMAC-SHA256, V1/V2/V3 formats | Compact, self-contained, time-limited | No revocation, no usage limits |
| **Blob Presign** | HMAC-SHA256 signed URLs | Stateless verification | Time-based only, no download limits |
| **App Permissions** | Origin → Capability[] mapping | Simple, effective | No rate limits, no granular control |

### Known Issues

- SEC-001: API keys stored unencrypted in localStorage
- SEC-003: Bootstrap key exposed in wrangler.json
- SEC-004: Tokens visible in URL fragments
- SEC-005: No rate limiting on auth endpoints
- No API key rotation mechanism
- No token revocation mechanism

## Design Goals

1. **Key Rolling**: Rotate API keys without service disruption
2. **Token Revocation**: Invalidate tokens before expiry
3. **Granular Access**: Fine-grained capability control per resource
4. **Usage Control**: Rate limits, quotas, download limits
5. **Flexible Expiry**: One-time, time-limited, forever tokens
6. **Bearer Token Support**: Standard Authorization header
7. **Apps See Only API Keys**: Complexity hidden from applications
8. **Audit Trail**: Track all access for compliance

## Architecture Overview

- **Application Layer**: Apps use `Authorization: ApiKey {key}` or `Bearer {token}`
- **Gateway Auth Layer** contains:
  - Key Resolver: API Key → Principal ID, key rotation, key scoping
  - Token Verifier: Signature, expiry, revocation checks
  - Policy Evaluator: Rate limits, quotas, usage tracking
- **Auth Context** output: `{ principalId, capabilities, limits, metadata }`
- **Resource Layer**: KV, Blob, and Log operations

## Token Types

```typescript
enum TokenType {
  API_KEY = 'api_key',           // Long-lived, rotatable
  RESOURCE_TOKEN = 'resource',   // Access to specific resource(s)
  SHARE_TOKEN = 'share',         // Shareable, may have usage limits
  REFRESH_TOKEN = 'refresh',     // For key rotation
  SESSION_TOKEN = 'session',     // Short-lived, for web sessions
}

enum ExpiryType {
  TIMED = 'timed',               // Expires at specific time
  SLIDING = 'sliding',           // Extends on use
  FOREVER = 'forever',           // Never expires (revocation only)
  ONE_TIME = 'one_time',         // Single use
  N_TIMES = 'n_times',           // Limited number of uses
}
```

## Token V4 Structure

```typescript
interface TokenV4 {
  version: 4;
  type: TokenType;

  scope: {
    resourceType: 'kv' | 'blob' | 'log' | 'all';
    resourceId?: string;
    namespace?: string;
  };

  permissions: Permission[];    // ['read', 'write', 'delete', 'admin']

  expiry: {
    type: ExpiryType;
    expiresAt?: number;
    slidingWindow?: number;
    usesRemaining?: number;
  };

  limits?: {
    rateLimit?: number;
    quotaLimit?: number;
    bandwidthLimit?: number;
  };

  issuedAt: number;
  issuerPrincipal: string;
  tokenId: string;              // For revocation tracking
}
```

## Token Creation API

```typescript
interface CreateTokenRequest {
  type: TokenType;
  scope: {
    resourceType: 'kv' | 'blob' | 'log' | 'all';
    resourceId?: string;
    namespace?: string;
  };
  permissions: Permission[];
  expiry: {
    type: ExpiryType;
    expiresAt?: string;
    slidingWindowSeconds?: number;
    maxUses?: number;
  };
  limits?: {
    rateLimit?: number;
    quotaLimit?: number;
    bandwidthLimit?: number;
  };
  metadata?: Record<string, string>;
}

interface CreateTokenResponse {
  token: string;
  tokenId: string;
  expiresAt?: string;
}
```

## API Key Management

### Key Storage

```typescript
interface PrincipalKeys {
  principalId: string;
  keys: {
    keyHash: string;
    keyId: string;
    status: 'active' | 'rotating' | 'revoked';
    createdAt: string;
    lastUsedAt?: string;
    expiresAt?: string;
    capabilities?: Capability[];
    metadata?: {
      name?: string;
      createdBy?: string;
    };
  }[];
  rotationPolicy?: {
    autoRotateAfterDays?: number;
    warnBeforeDays?: number;
  };
}
```

### Key Rotation Flow

1. **Key A (active)** - Current working key
2. **Key A + B (grace period)** - Both keys work, A is marked "rotating"
3. **Key B (active)** - Key A revoked, only B works

### Key Management API

```typescript
interface CreateKeyRequest {
  displayName?: string;
  capabilities?: Capability[];
  expiresAt?: string;
  markCurrentAsRotating?: boolean;
}

interface RevokeKeyRequest {
  keyId: string;
}

interface ListKeysResponse {
  keys: {
    keyId: string;
    displayName?: string;
    status: 'active' | 'rotating' | 'revoked';
    createdAt: string;
    lastUsedAt?: string;
    expiresAt?: string;
    capabilities?: Capability[];
  }[];
}
```

## Token Revocation

### Strategies Comparison

| Strategy | Latency | Storage | Complexity |
|----------|---------|---------|------------|
| **Revocation List** | Low | Medium | Low |
| **Short Expiry + Refresh** | Medium | Low | Medium |
| **Token Versioning** | Immediate | Low | Medium |
| **Distributed Cache** | Low | High | High |

### Recommended: Hybrid Approach

- **Short-lived tokens** (< 1 hour): No revocation needed
- **Medium-lived tokens** (1 hour - 7 days): Revocation list in KV
- **Long-lived tokens** (> 7 days): Token versioning + revocation list

### Revocation Types

```typescript
interface RevocationEntry {
  tokenId: string;
  revokedAt: string;
  revokedBy: string;
  reason?: string;
  originalExpiry?: string;
}

interface RevokeTokenRequest {
  tokenId: string;
  reason?: string;
}

interface RevokeAllTokensRequest {
  reason?: string;
  exceptTokenIds?: string[];
}
```

## Rate Limiting

```typescript
interface RateLimitConfig {
  principal: {
    requestsPerMinute: number;
    requestsPerHour: number;
    burstSize: number;
  };

  token?: {
    requestsPerMinute?: number;
    requestsPerHour?: number;
  };

  operations?: {
    'blob:upload': { requestsPerMinute: number; bandwidthPerHour: number };
    'log:append': { requestsPerMinute: number };
  };
}
```

Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `X-RateLimit-RetryAfter`

## Blob Token Access

```typescript
interface BlobAccessToken extends TokenV4 {
  scope: {
    resourceType: 'blob';
    resourceId: string;         // Key or pattern: "images/*"
    namespace: string;
  };
  permissions: ('read' | 'write' | 'delete')[];

  blobLimits?: {
    maxDownloads?: number;
    maxBandwidth?: number;
    allowedContentTypes?: string[];
  };
}

interface BlobShareRequest {
  key: string;
  namespace: string;
  expiry: {
    type: 'one_time' | 'n_times' | 'timed';
    maxDownloads?: number;
    expiresAt?: string;
  };
  password?: string;
}

interface BlobShareResponse {
  shareUrl: string;
  shareToken: string;
  tokenId: string;
  expiresAt?: string;
}
```

## Log Token Enhancements

```typescript
interface LogTokenV2 extends TokenV4 {
  scope: {
    resourceType: 'log';
    resourceId: string;
    namespace: string;
  };
  permissions: ('read' | 'write' | 'subscribe' | 'admin')[];

  logLimits?: {
    maxReads?: number;
    maxWrites?: number;
    maxEventsPerRead?: number;
    allowedSeqRange?: {
      from?: number;
      to?: number;
    };
  };
}
```

## Authorization Headers

```
Authorization: ApiKey {key}      // API Key (existing)
Authorization: Bearer {token}    // Bearer token (new)
X-Log-Token: {token}            // Legacy log tokens (deprecated)
```

## App-Level Configuration

```typescript
interface AppConfig {
  origin: string;
  allowedCapabilities: Capability[];

  limits?: {
    requestsPerMinute?: number;
    quotaPerDay?: number;
  };

  restrictions?: {
    kvKeyPatterns?: string[];
    blobKeyPatterns?: string[];
    allowedLogIds?: string[];
  };

  tokenPolicy?: {
    maxExpirySeconds?: number;
    allowedTokenTypes?: TokenType[];
    allowedPermissions?: Permission[];
  };
}
```

## Audit Logging

```typescript
interface AuditEvent {
  id: string;
  timestamp: string;

  principalId: string;
  tokenId?: string;
  tokenType?: TokenType;
  appOrigin?: string;

  action: AuditAction;
  resourceType: 'kv' | 'blob' | 'log' | 'principal' | 'token';
  resourceId?: string;

  success: boolean;
  errorCode?: string;
  ipAddress?: string;
  userAgent?: string;

  metadata?: Record<string, unknown>;
}

enum AuditAction {
  AUTH_SUCCESS = 'auth.success',
  AUTH_FAILURE = 'auth.failure',
  KEY_CREATED = 'key.created',
  KEY_ROTATED = 'key.rotated',
  KEY_REVOKED = 'key.revoked',
  TOKEN_CREATED = 'token.created',
  TOKEN_REVOKED = 'token.revoked',
  KV_READ = 'kv.read',
  KV_WRITE = 'kv.write',
  KV_DELETE = 'kv.delete',
  BLOB_UPLOAD = 'blob.upload',
  BLOB_DOWNLOAD = 'blob.download',
  BLOB_DELETE = 'blob.delete',
  LOG_CREATE = 'log.create',
  LOG_APPEND = 'log.append',
  LOG_READ = 'log.read',
  LOG_DELETE = 'log.delete',
  PERMISSION_GRANTED = 'permission.granted',
  PERMISSION_REVOKED = 'permission.revoked',
  CONFIG_CHANGED = 'config.changed',
}

interface AuditConfig {
  enabled: boolean;
  retention: 'forever' | { days: number };
  includeActions: AuditAction[] | 'all';
  excludeActions?: AuditAction[];
  destinations: {
    type: 'log' | 'webhook' | 'kv';
    config: Record<string, unknown>;
  }[];
}
```

## Migration Path

### Phase 1: Token V4 Infrastructure
1. Implement TokenV4 format alongside existing formats
2. Add token verification that supports all versions
3. Add `tokenId` to all token types for revocation tracking

### Phase 2: Revocation System
1. Add revocation list storage (`__REVOKED:*` keys)
2. Implement revocation check in verification flow
3. Add revocation API endpoints

### Phase 3: Key Rotation
1. Update principal storage to support multiple keys
2. Add key management API endpoints
3. Add rotation UI to org app

### Phase 4: Usage Limits
1. Implement rate limiter (DO for CF, in-memory for self-hosted)
2. Add usage tracking for quota limits
3. Add download counting for blobs

### Phase 5: Blob Tokens
1. Extend token system for blob access
2. Add blob sharing endpoints
3. Implement download counting

### Phase 6: Audit Logging
1. Define audit event schema
2. Implement audit log storage
3. Add audit events to all operations

## Security Considerations

### Token Security
- All tokens use HMAC-SHA256 or better
- Timing-safe comparison for all verification
- Token IDs are not secret (can be exposed for management)
- Secrets never logged or returned after creation

### Key Security
- Keys hashed with SHA-256 before storage
- Support for HSM-backed signing (future)
- Automatic key expiry warnings
- Force rotation after compromise

### Rate Limiting Security
- Per-IP rate limiting for unauthenticated endpoints
- Graduated response (429 → temporary ban)
- Separate limits for auth attempts

## Open Questions

1. **Token storage**: Store issued tokens in DB for enumeration, or stateless only?
2. **Revocation propagation**: How quickly must revocation take effect globally?
3. **Key hierarchy**: Should there be master keys that can create sub-keys?
4. **OAuth integration**: Support OAuth providers for authentication?
5. **RBAC vs ABAC**: Role-based or attribute-based access control?
6. **Multi-tenancy**: Separate auth domains per tenant?

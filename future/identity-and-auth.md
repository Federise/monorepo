# Identity, Authentication & Authorization Architecture

## Overview

This document defines the unified approach to identity, authentication, and authorization in Federise. It supersedes and consolidates concepts from `auth.md` (tokens) and `permissions.md` (namespaces) into a coherent architecture.

**Key insight**: The current model conflates identity with authentication. A "principal" is both an identity AND an API key. This limits our ability to:
- Have multiple authentication methods for one identity
- Invite new users without pre-creating their identity
- Support different identity types (human users, services, agents)
- Implement proper key rotation

---

## Current State Analysis

### What We Have

```
┌─────────────────────────────────────────────────────────┐
│                    PRINCIPAL                            │
│  ┌─────────────────────────────────────────────────┐   │
│  │ secret_hash: string   // Identity = API Key     │   │
│  │ display_name: string                            │   │
│  │ created_at: string                              │   │
│  │ active: boolean                                 │   │
│  └─────────────────────────────────────────────────┘   │
│                          │                              │
│                          ▼                              │
│               FULL ACCESS TO EVERYTHING                 │
│                 (no scoping, no limits)                 │
└─────────────────────────────────────────────────────────┘
```

### Problems

| Problem | Impact |
|---------|--------|
| Identity = API Key | Can't rotate keys without losing identity |
| No identity types | Can't distinguish humans from services |
| All-or-nothing access | Every principal is a superuser |
| No invitation flow | Must use bootstrap key to create principals |
| No delegation | Can't grant limited access to others |
| Single auth method | API key only, no bearer tokens |

---

## Design Principles

1. **Identity is separate from authentication** - Who you are vs how you prove it
2. **Least privilege by default** - New identities have minimal access
3. **Explicit capability grants** - Access must be explicitly given
4. **Flexible token model** - Both stateless and stateful, generic across capabilities
5. **Defense in depth** - Multiple enforcement layers
6. **Auditability** - All access decisions are logged
7. **Resource-level control** - Resources can define their own access policies
8. **Apps are first-class** - Third-party apps have identity and participate in auth

---

## Identity Model

### Identity Types

```typescript
enum IdentityType {
  USER = 'user',           // Human user (principal owner)
  SERVICE = 'service',     // Automated service/bot (server-side)
  AGENT = 'agent',         // AI agent acting on behalf of user
  APP = 'app',             // Third-party app (frame-mediated)
  ANONYMOUS = 'anonymous', // Token-based access without persistent identity
}

interface Identity {
  id: string;                    // Globally unique identifier
  type: IdentityType;
  displayName: string;

  createdAt: string;
  createdBy?: string;            // Identity that created this one

  status: 'active' | 'suspended' | 'deleted';

  metadata?: {
    email?: string;              // For users
    serviceUrl?: string;         // For services
    parentIdentity?: string;     // For agents (who they act for)
    origin?: string;             // For apps (the app's origin)
  };
}
```

### Identity Type Details

| Type | Authentication | Capabilities | Use Case |
|------|----------------|--------------|----------|
| **USER** | API key, bearer token | Full principal capabilities | Human account owner |
| **SERVICE** | API key | Scoped to service purpose | Server-side automation |
| **AGENT** | Derived from parent | Subset of parent's capabilities | AI assistant |
| **APP** | Frame-mediated (origin) | Intersection of app grants + acting principal | Third-party web apps |
| **ANONYMOUS** | Resource token only | Token-encoded permissions | Link sharing recipients |

### Identity Hierarchy

```
                    ┌─────────────┐
                    │   SYSTEM    │  Bootstrap/root identity
                    └──────┬──────┘
                           │ creates
                    ┌──────▼──────┐
                    │    USER     │  Human account (principal)
                    └──────┬──────┘
                           │ creates/authorizes
      ┌────────────────────┼────────────────────┐
      │                    │                    │
┌─────▼─────┐       ┌──────▼──────┐      ┌──────▼──────┐
│  SERVICE  │       │    AGENT    │      │    APP      │
│ (backend) │       │  (AI asst)  │      │ (3rd party) │
└───────────┘       └─────────────┘      └──────┬──────┘
                                                │ issues
                                         ┌──────▼──────┐
                                         │  ANONYMOUS  │
                                         │ (share tok) │
                                         └─────────────┘
```

### APP Identity Model

Apps are special: they act **on behalf of** a principal through the frame.

```typescript
interface AppIdentity extends Identity {
  type: 'app';

  // App-specific fields
  origin: string;                // e.g., "https://notes-app.example.com"
  originHash: string;            // SHA-256 of origin (for storage keys)

  // App's own capabilities (granted by users)
  grantedCapabilities: Capability[];

  // Whether this app can connect via /frame
  frameAccess: boolean;
}

// When an app makes a request through the frame:
interface AppAuthContext {
  app: AppIdentity;              // The app's identity
  actingAs: Identity;            // The principal the app acts on behalf of

  // Effective capabilities = intersection of:
  // 1. App's granted capabilities (what the app is allowed to do)
  // 2. Principal's capabilities (what the user can do)
  // 3. User's grant to this specific app (user consent)
  effectiveCapabilities: Capability[];
}
```

**Key principle**: An app can never do more than:
1. What the app itself has been granted (by any user)
2. What the acting principal is allowed to do
3. What the acting principal has explicitly granted to this app

### Identity vs Principal (Migration)

The current "principal" concept maps to an `Identity` + `Credential`:

```typescript
// Current (principal = identity + credential combined)
{
  secret_hash: "abc123",      // Both the ID and the auth
  display_name: "My App",
  active: true
}

// New (separated)
Identity: {
  id: "ident_xyz789",
  type: "user",
  displayName: "My App",
  status: "active"
}
Credential: {
  id: "cred_abc123",
  identityId: "ident_xyz789",
  type: "api_key",
  secretHash: "...",
  status: "active"
}
```

---

## Authentication Model

### Credential Types

```typescript
enum CredentialType {
  API_KEY = 'api_key',           // Long-lived secret
  BEARER_TOKEN = 'bearer_token', // Time-limited token
  REFRESH_TOKEN = 'refresh_token', // For obtaining new bearer tokens
  INVITATION = 'invitation',     // One-time use for identity creation
}

interface Credential {
  id: string;                    // Credential identifier (for management)
  identityId: string;            // Which identity this authenticates
  type: CredentialType;

  // For API keys (stored)
  secretHash?: string;

  // For tokens (not stored - self-contained)
  // Verified via signature, not lookup

  status: 'active' | 'rotating' | 'revoked';

  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;

  // Scope limitations (optional)
  scope?: CredentialScope;

  metadata?: {
    name?: string;               // Human-readable name
    createdBy?: string;          // Who created this credential
    rotatesFrom?: string;        // Previous credential being rotated
  };
}

interface CredentialScope {
  capabilities?: Capability[];   // Subset of identity's capabilities
  namespaces?: string[];         // Restrict to specific namespaces
  resources?: ResourceScope[];   // Specific resource access
  expiresAt?: string;            // Earlier than credential expiry
}
```

### Authentication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        REQUEST                                   │
│  Authorization: ApiKey <key>  OR  Authorization: Bearer <token> │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AUTH MIDDLEWARE                               │
│  1. Parse header (detect ApiKey vs Bearer)                      │
│  2. Validate credential                                         │
│     - ApiKey: hash lookup in KV                                 │
│     - Bearer: signature verification (stateless)                │
│  3. Check credential status (not revoked, not expired)          │
│  4. Resolve identity from credential                            │
│  5. Build AuthContext                                           │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AUTH CONTEXT                                │
│  {                                                              │
│    identity: Identity,                                          │
│    credential: CredentialInfo,                                  │
│    effectiveCapabilities: Capability[],                         │
│    effectiveNamespaces: string[],                               │
│    limits: RateLimits,                                          │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Token Architecture

### Design Goals

Tokens should be:
1. **Generic** - One token system works across all Federise capabilities (channels, blobs, KV, etc.)
2. **Flexible** - Support different lifetimes, constraints, and purposes
3. **Composable** - Constraints can be combined (time-limited AND use-limited AND rate-limited)
4. **Both stateless and stateful** - Choose the right trade-off per use case

### Token Taxonomy

```
┌─────────────────────────────────────────────────────────────────┐
│                         TOKENS                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  BY STATEFULNESS:                                               │
│  ├─ Stateless (self-contained, verified by signature)           │
│  │  └─ Fast verification, no DB lookup                          │
│  │  └─ Limited revocation (expiry only, or secret rotation)     │
│  └─ Stateful (requires lookup/tracking)                         │
│     └─ Full revocation, use counting, audit trail               │
│     └─ Higher latency, requires storage                         │
│  └─ Hybrid (stateless verification + optional state check)      │
│     └─ Fast path for valid tokens, state check for constraints  │
│                                                                  │
│  BY LIFETIME:                                                   │
│  ├─ One-time (single use, then invalid)                         │
│  ├─ N-times (limited number of uses)                            │
│  ├─ Time-limited (expires after duration)                       │
│  ├─ Sliding expiry (extends on each use)                        │
│  └─ Perpetual (no automatic expiry, revocation only)            │
│                                                                  │
│  BY PURPOSE:                                                    │
│  ├─ Authentication (proves identity)                            │
│  ├─ Authorization (grants capability on resource)               │
│  ├─ Delegation (pass on access to others)                       │
│  └─ Provisioning (create new identity/resource)                 │
│                                                                  │
│  BY SCOPE:                                                      │
│  ├─ Identity-wide (all of identity's capabilities)              │
│  ├─ Resource-specific (one resource, specific permissions)      │
│  ├─ Namespace-scoped (all resources in a namespace)             │
│  └─ Action-specific (single action, e.g., "download once")      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Generic Token Model

All tokens share a common structure with capability-specific extensions:

```typescript
interface Token {
  // === HEADER (common to all tokens) ===
  version: number;              // Token format version
  type: TokenType;              // bearer, resource, share, invitation, etc.

  // === SCOPE (what this token grants access to) ===
  scope: TokenScope;

  // === CONSTRAINTS (limits on token usage) ===
  constraints: TokenConstraints;

  // === IDENTITY (who issued/holds this token) ===
  issuerId?: string;            // Who created this token
  holderId?: string;            // Who this token is for (if known)
  authorId?: string;            // Unique ID for this token holder (for tracking)

  // === SIGNATURE ===
  signature: Uint8Array;
}

interface TokenScope {
  // What resources does this token grant access to?
  resourceType?: 'channel' | 'blob' | 'kv' | 'namespace' | 'identity' | 'all';
  resourceId?: string;          // Specific resource, or pattern
  namespace?: string;           // Namespace restriction

  // What actions are allowed?
  permissions: number;          // Bitmap of allowed actions
}

interface TokenConstraints {
  // === TIME CONSTRAINTS ===
  issuedAt?: number;            // When token was created
  expiresAt?: number;           // Hard expiry time
  slidingWindowSeconds?: number; // Extend expiry on use

  // === USE CONSTRAINTS ===
  maxUses?: number;             // Total uses allowed (requires state)
  usesRemaining?: number;       // Embedded count (for stateless, trusted scenarios)

  // === RATE CONSTRAINTS ===
  rateLimit?: {
    requestsPerMinute?: number;
    requestsPerHour?: number;
    bandwidthPerHour?: number;  // For blob downloads
  };

  // === DELEGATION CONSTRAINTS ===
  canDelegate?: boolean;        // Can this token be used to create sub-tokens?
  maxDelegationDepth?: number;  // How many levels of delegation
  delegationDepth?: number;     // Current depth (0 = original)

  // === TRACKING ===
  requiresStateCheck?: boolean; // Must check revocation list
  tokenId?: string;             // For stateful tracking/revocation
}
```

### Permission Bitmaps (Generic Across Resources)

```typescript
// Common permissions (bits 0-7)
const PERM_READ       = 0x01;   // Read/view/download
const PERM_WRITE      = 0x02;   // Write/append/upload
const PERM_DELETE     = 0x04;   // Delete
const PERM_LIST       = 0x08;   // List/enumerate
const PERM_ADMIN      = 0x10;   // Administrative actions
const PERM_SHARE      = 0x20;   // Create share tokens
const PERM_DELEGATE   = 0x40;   // Delegate to others
const PERM_RESERVED   = 0x80;   // Reserved for future use

// Resource-specific permissions (bits 8-15)
// Channel-specific
const PERM_CHANNEL_SUBSCRIBE   = 0x0100;  // Real-time subscription
const PERM_CHANNEL_DELETE_OWN  = 0x0200;  // Delete own messages
const PERM_CHANNEL_DELETE_ANY  = 0x0400;  // Delete any message

// Blob-specific
const PERM_BLOB_PRESIGN        = 0x0100;  // Create presigned URLs

// Identity-specific
const PERM_IDENTITY_CREATE     = 0x0100;  // Create new identities
const PERM_IDENTITY_INVITE     = 0x0200;  // Create invitations
```

### Token Type Examples

#### Example 1: Simple Share Link (Stateless)

"Anyone with this link can read and write to the channel for 7 days"

```typescript
const shareToken: Token = {
  version: 1,
  type: 'share',
  scope: {
    resourceType: 'channel',
    resourceId: 'ch_abc123',
    permissions: PERM_READ | PERM_WRITE,
  },
  constraints: {
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    // No maxUses = unlimited (stateless)
  },
  issuerId: 'user_xyz',
  authorId: 'share_001',  // Unique per-token for tracking writes
  signature: /* HMAC-SHA256 */
};
```

#### Example 2: Limited Download Token (Stateful)

"Download this file up to 3 times within 24 hours"

```typescript
const downloadToken: Token = {
  version: 1,
  type: 'resource',
  scope: {
    resourceType: 'blob',
    resourceId: 'blob_def456',
    permissions: PERM_READ,
  },
  constraints: {
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    maxUses: 3,
    requiresStateCheck: true,
    tokenId: 'tok_download_789',
  },
  issuerId: 'user_xyz',
  signature: /* HMAC-SHA256 */
};
```

#### Example 3: Invitation to Create Principal

"Create a new principal with these specific capabilities"

```typescript
const invitationToken: Token = {
  version: 1,
  type: 'invitation',
  scope: {
    resourceType: 'identity',
    permissions: PERM_IDENTITY_CREATE,
  },
  constraints: {
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    maxUses: 1,  // One-time use
    requiresStateCheck: true,
    tokenId: 'inv_abc123',
  },
  issuerId: 'user_xyz',
  // Pre-configured grants encoded separately
  signature: /* HMAC-SHA256 */
};

// Associated invitation data (stored, not in token)
const invitationData = {
  tokenId: 'inv_abc123',
  grants: {
    capabilities: ['channel:read', 'channel:append'],
    resources: [
      { type: 'channel', id: 'ch_abc123', permissions: PERM_READ | PERM_WRITE }
    ],
  },
};
```

#### Example 4: Rate-Limited API Access

"Access the API with rate limits"

```typescript
const bearerToken: Token = {
  version: 1,
  type: 'bearer',
  scope: {
    resourceType: 'all',  // Full identity access
    permissions: 0xFFFF,  // All permissions (limited by identity's grants)
  },
  constraints: {
    expiresAt: Date.now() + 60 * 60 * 1000,  // 1 hour
    rateLimit: {
      requestsPerMinute: 60,
      requestsPerHour: 1000,
    },
  },
  holderId: 'user_xyz',
  signature: /* HMAC-SHA256 */
};
```

#### Example 5: Ephemeral One-Time Action

"Approve this specific action once"

```typescript
const actionToken: Token = {
  version: 1,
  type: 'action',
  scope: {
    resourceType: 'channel',
    resourceId: 'ch_abc123',
    permissions: PERM_CHANNEL_DELETE_ANY,  // Delete a specific message
  },
  constraints: {
    expiresAt: Date.now() + 5 * 60 * 1000,  // 5 minutes
    maxUses: 1,
    requiresStateCheck: true,
    tokenId: 'act_delete_msg_456',
  },
  // Additional context stored separately
  signature: /* HMAC-SHA256 */
};
```

### Token Types

#### 1. API Key (Stateful, Long-lived, Authentication)

```typescript
// Not actually a "token" - it's a credential
// Stored: yes (hash in KV)
// Verification: hash lookup
// Revocable: yes (delete from KV)
// Use case: Server-to-server, long-running services
```

#### 2. Bearer Token (Stateless, Time-limited, Authentication)

```typescript
interface BearerToken {
  // Header
  version: number;
  type: 'bearer';

  // Identity binding
  identityId: string;          // Which identity this represents
  credentialId?: string;       // Optional: which credential issued it

  // Scope (may be subset of identity's full capabilities)
  capabilities: number;        // Bitmap
  namespaces?: string[];       // If restricted

  // Expiry
  issuedAt: number;
  expiresAt: number;

  // Signature
  signature: Uint8Array;
}

// Use case: Web sessions, short-lived API access
// Verification: signature check + expiry check (no DB lookup)
// Revocable: only via identity-wide invalidation or short expiry
```

#### 3. Resource Token (Stateless, Time-limited, Authorization)

```typescript
interface ResourceToken {
  // Header
  version: number;
  type: 'resource';

  // Resource binding
  resourceType: 'channel' | 'blob' | 'kv' | 'namespace';
  resourceId: string;

  // Permissions (resource-specific)
  permissions: number;         // Bitmap for this resource type

  // Identity (who created it, for audit)
  issuerId: string;            // Identity that created this token
  authorId?: string;           // Unique author ID for this token holder

  // Expiry
  expiresAt: number;

  // Signature (signed with resource's secret)
  signature: Uint8Array;
}

// Use case: Sharing a channel, granting blob access
// Verification: signature check with resource's secret
// This is what current log tokens are
```

#### 4. Share Token (Stateless, Delegatable, Authorization)

```typescript
interface ShareToken extends ResourceToken {
  type: 'share';

  // Sharing constraints
  constraints?: {
    maxUses?: number;          // (requires stateful tracking if enforced)
    maxDelegations?: number;   // How many times this can be re-shared
    delegationDepth?: number;  // Current depth (0 = original)
  };

  // For display in share UI
  displayName?: string;
}

// Use case: "Share this channel with anyone who has this link"
// May be stateless (no use tracking) or stateful (use counting)
```

#### 5. Invitation Token (Stateful, One-time, Identity Creation)

```typescript
interface InvitationToken {
  // Header
  version: number;
  type: 'invitation';

  // Invitation details
  invitationId: string;        // For lookup and revocation
  invitedBy: string;           // Identity that created invitation

  // Pre-configured grants
  grants?: {
    capabilities?: Capability[];
    namespaces?: NamespaceGrant[];
    resources?: ResourceGrant[];
  };

  // Constraints
  expiresAt: number;
  maxIdentityType?: IdentityType;  // Can't create higher than this

  // Signature
  signature: Uint8Array;
}

// Use case: "Join my workspace" links
// Verification: signature check + lookup (check not already used)
// MUST be stateful to prevent reuse
```

#### 6. Refresh Token (Stateful, Long-lived, Token Renewal)

```typescript
interface RefreshToken {
  // Header
  version: number;
  type: 'refresh';

  // Binding
  identityId: string;
  credentialId: string;        // Which credential this refreshes

  // Token ID (for revocation)
  tokenId: string;

  // Constraints
  issuedAt: number;
  expiresAt: number;           // Longer than bearer tokens

  // Signature
  signature: Uint8Array;
}

// Use case: Web apps that need to maintain sessions
// Verification: signature + revocation list check
// Exchange for new bearer token
```

---

## Unified Token Format

### Binary Format (Compact)

All tokens share a common binary structure for consistency:

```
┌─────────┬────────┬─────────────────────────────────┬───────────┐
│ Version │  Type  │         Type-Specific Data       │ Signature │
│ 1 byte  │ 1 byte │          Variable length         │ 12-16 B   │
└─────────┴────────┴─────────────────────────────────┴───────────┘
```

```typescript
enum TokenTypeCode {
  BEARER = 0x01,
  RESOURCE = 0x02,
  SHARE = 0x03,
  INVITATION = 0x04,
  REFRESH = 0x05,
}

// Type-specific layouts:

// BEARER (auth token for identity)
// version(1) + type(1) + identityId(8) + capabilities(2) + expiresAt(4) + sig(12) = 28 bytes

// RESOURCE (access to specific resource)
// version(1) + type(1) + resourceType(1) + resourceId(6) + permissions(1) + issuerId(4) + authorId(2) + expiresAt(3) + sig(12) = 31 bytes

// SHARE (shareable resource access)
// version(1) + type(1) + resourceType(1) + resourceId(6) + permissions(1) + issuerId(4) + authorId(2) + expiresAt(3) + constraints(2) + sig(12) = 33 bytes

// INVITATION (one-time identity creation)
// version(1) + type(1) + invitationId(8) + inviterId(8) + grants(4) + expiresAt(4) + sig(16) = 42 bytes
```

### Signing Strategy

```typescript
interface SigningConfig {
  // Different token types use different signing keys
  bearerTokens: 'identity_derived_key',   // HKDF(master, identityId)
  resourceTokens: 'resource_secret',      // Stored with resource
  shareTokens: 'resource_secret',         // Same as resource
  invitations: 'principal_key',           // Principal's signing key
  refreshTokens: 'credential_key',        // Per-credential key
}

// Key derivation for identity-scoped tokens:
// derivedKey = HKDF-SHA256(
//   ikm: principalMasterKey,
//   salt: tokenType + identityId,
//   info: "federise-token-v1"
// )
```

---

## Invitation Flow

### Creating an Invitation

```typescript
interface CreateInvitationRequest {
  // What the invitation grants
  grants?: {
    capabilities?: Capability[];
    namespaces?: NamespaceGrant[];
    resources?: ResourceGrant[];
  };

  // Constraints
  expiresInSeconds?: number;   // Default: 7 days
  maxUses?: number;            // Default: 1

  // Metadata
  note?: string;               // "Invitation for Alice"
}

interface CreateInvitationResponse {
  invitationId: string;
  token: string;               // The invitation token
  url: string;                 // Ready-to-share URL
  expiresAt: string;
}
```

### Accepting an Invitation

```typescript
interface AcceptInvitationRequest {
  token: string;               // The invitation token

  // New identity details
  displayName: string;
  identityType?: IdentityType; // Default: USER
}

interface AcceptInvitationResponse {
  identity: Identity;
  credential: {
    type: 'api_key';
    secret: string;            // One-time display
  };
  grants: GrantSummary[];      // What was granted
}
```

### Invitation State Machine

```
┌────────────┐     create      ┌────────────┐
│            │ ───────────────▶│            │
│  (none)    │                 │  PENDING   │
│            │                 │            │
└────────────┘                 └─────┬──────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
                    ▼                ▼                ▼
              ┌──────────┐    ┌───────────┐    ┌───────────┐
              │ ACCEPTED │    │  EXPIRED  │    │  REVOKED  │
              └──────────┘    └───────────┘    └───────────┘
```

---

## Authorization Model

### Capability Grants

```typescript
interface CapabilityGrant {
  grantId: string;

  // Who
  identityId: string;

  // What
  capability: Capability;

  // Where (optional restrictions)
  scope?: {
    namespaces?: string[];     // Restrict to these namespaces
    keyPatterns?: string[];    // Restrict to matching keys
    resourceIds?: string[];    // Restrict to specific resources
  };

  // When
  grantedAt: string;
  grantedBy: string;           // Identity that granted this
  expiresAt?: string;

  // How
  source: 'direct' | 'invitation' | 'delegation' | 'system';
}
```

### Effective Permissions

When evaluating access, combine:
1. Identity's capability grants
2. Credential's scope restrictions
3. Token's permission claims (if bearer/share token)

```typescript
function getEffectivePermissions(
  identity: Identity,
  credential: Credential,
  token?: Token
): EffectivePermissions {
  // Start with identity's grants
  let permissions = getIdentityGrants(identity.id);

  // Intersect with credential scope (if restricted)
  if (credential.scope) {
    permissions = intersect(permissions, credential.scope);
  }

  // Intersect with token claims (if token-based auth)
  if (token?.type === 'bearer' && token.capabilities) {
    permissions = intersect(permissions, token.capabilities);
  }

  return permissions;
}
```

---

## Resource-Level Authorization

Resources (channels, blobs, KV entries, namespaces) can define their own access policies independent of identity-level grants. This allows for:

- **Security through obscurity**: Location alone grants access (anyone who knows the ID can access)
- **Identity-required**: Must have a valid identity with appropriate grants
- **Mixed**: Read without identity, write requires identity
- **Fine-grained**: Different permissions for different actions

### Resource Access Policy

```typescript
interface ResourceAccessPolicy {
  resourceType: 'channel' | 'blob' | 'kv' | 'namespace';
  resourceId: string;

  // Default access level when no token/identity provided
  publicAccess: {
    read: boolean;         // Can anyone with the ID read?
    write: boolean;        // Can anyone with the ID write?
    list: boolean;         // Can anyone enumerate?
  };

  // When identity is provided but no specific grant
  authenticatedAccess: {
    read: boolean;
    write: boolean;
    delete: boolean;
  };

  // Per-action authorization requirements
  actions: {
    [action: string]: ActionPolicy;
  };
}

interface ActionPolicy {
  // Who can perform this action?
  requires: 'none' | 'identity' | 'grant' | 'owner';

  // Additional constraints
  constraints?: {
    authorOnly?: boolean;     // Only the author of the content
    ownerOnly?: boolean;      // Only the resource owner
    tokenRequired?: boolean;  // Must have a resource token
    rateLimit?: RateLimit;
  };
}
```

### Channel Access Policy Example

```typescript
const channelPolicy: ResourceAccessPolicy = {
  resourceType: 'channel',
  resourceId: 'ch_abc123',

  // Default: channel ID is secret enough for basic access
  publicAccess: {
    read: true,      // Anyone with channel ID can read
    write: false,    // Writing requires more
    list: false,     // Can't enumerate channels
  },

  authenticatedAccess: {
    read: true,
    write: true,     // Authenticated users can write
    delete: false,   // Deletion needs explicit grant
  },

  actions: {
    'read': { requires: 'none' },
    'append': { requires: 'identity' },
    'delete:own': {
      requires: 'identity',
      constraints: { authorOnly: true }
    },
    'delete:any': { requires: 'grant' },
    'admin': { requires: 'owner' },
  }
};
```

### Access Evaluation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    ACCESS REQUEST                                │
│  Resource: channel ch_abc123                                    │
│  Action: append                                                 │
│  Auth: Bearer token / Resource token / None                     │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│              1. RESOLVE RESOURCE POLICY                          │
│  - Fetch ResourceAccessPolicy for ch_abc123                     │
│  - Default to restrictive if not found                          │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│              2. CHECK ACTION REQUIREMENT                         │
│  - action 'append' requires: 'identity'                         │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
              No Auth                  Has Auth
                    │                       │
                    ▼                       ▼
             ┌──────────┐          ┌───────────────┐
             │  DENY    │          │ 3. CHECK      │
             │  (401)   │          │    IDENTITY   │
             └──────────┘          │    GRANTS     │
                                   └───────┬───────┘
                                           │
                                ┌──────────┴──────────┐
                                │                     │
                          Has Grant             No Grant
                                │                     │
                                ▼                     ▼
                         ┌──────────┐          ┌───────────────┐
                         │  ALLOW   │          │ 4. CHECK      │
                         └──────────┘          │    RESOURCE   │
                                               │    TOKEN      │
                                               └───────┬───────┘
                                                       │
                                            ┌──────────┴──────────┐
                                            │                     │
                                    Has Valid Token          No Token
                                            │                     │
                                            ▼                     ▼
                                     ┌──────────┐          ┌──────────┐
                                     │  ALLOW   │          │  DENY    │
                                     │(w/ token │          │  (403)   │
                                     │ perms)   │          └──────────┘
                                     └──────────┘
```

### Resource Policy Storage

```
# Resource policies
__RESOURCE_POLICY:{resourceType}:{resourceId} → ResourceAccessPolicy

# Default policies per resource type (fallback)
__DEFAULT_POLICY:{resourceType} → ResourceAccessPolicy
```

---

## Permission Request System

When an invitee (or any identity) needs capabilities beyond what they have, they can **request** additional permissions. Apps can participate in managing these requests.

### Permission Request Model

```typescript
interface PermissionRequest {
  id: string;

  // Who is requesting
  requesterId: string;           // Identity requesting permission
  requesterType: IdentityType;

  // What they're requesting
  requested: {
    capabilities?: Capability[];
    resources?: ResourceGrant[];
    namespaces?: NamespaceGrant[];
  };

  // Context
  reason?: string;               // User-provided justification
  sourceInvitation?: string;     // If this came from an invitation
  sourceApp?: string;            // If requested through an app

  // Scope hints (which app/context is this for)
  forApp?: string;               // App origin this request is scoped to
  forResource?: string;          // Specific resource this is for

  // Status
  status: 'pending' | 'approved' | 'denied' | 'expired';
  createdAt: string;
  expiresAt: string;

  // Resolution
  resolvedAt?: string;
  resolvedBy?: string;
  grantedSubset?: PermissionGrant[];  // May grant less than requested
}
```

### App Participation in Permission Requests

Apps can have granular capabilities around permission requests:

```typescript
type PermissionRequestCapability =
  | 'permission_request:view:own'      // See requests scoped to this app
  | 'permission_request:view:count'    // See count of pending requests
  | 'permission_request:view:details'  // See full request details
  | 'permission_request:filter'        // Suggest filtering in popup
  | 'permission_request:create'        // Create requests on behalf of users
```

### Permission Request Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     APP (Third-party)                            │
│                                                                  │
│  1. User action requires capability app doesn't have            │
│  2. App creates PermissionRequest (if has permission_request:   │
│     create)                                                     │
│  3. App can see pending requests scoped to it                   │
│  4. App can help organize/filter requests for popup             │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                │ SDK: federise.requestPermission()
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FRAME (Trusted)                              │
│                                                                  │
│  - Receives permission request from app                         │
│  - Stores request in pending queue                              │
│  - Can trigger popup or badge notification                      │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                │ User clicks to review
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     POPUP (Trusted UI)                           │
│                                                                  │
│  - Shows pending permission requests                            │
│  - App-provided filters/organization (if app has capability)    │
│  - User approves/denies/modifies                                │
│  - Only popup can actually grant permissions                    │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                │ Grant/Deny
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     GATEWAY                                      │
│                                                                  │
│  - Records grant/denial                                         │
│  - Updates identity's capabilities                              │
│  - Notifies frame/app of resolution                             │
└─────────────────────────────────────────────────────────────────┘
```

### App-Assisted Request Organization

Apps with `permission_request:filter` can help users manage requests:

```typescript
interface RequestFilterHint {
  // App provides hints to the popup about which requests
  // the user might want to see/act on

  requestIds: string[];          // Which requests to show
  priority?: 'high' | 'normal' | 'low';
  groupBy?: string;              // Suggested grouping
  userContext?: string;          // "User is trying to share a document"
}

// App can query requests scoped to it
interface AppRequestQuery {
  // With permission_request:view:own
  forApp: string;                // Must be the querying app's origin

  // With permission_request:view:count (minimal info)
  countOnly?: boolean;

  // Response
  requests: PermissionRequest[];  // Or just { count: number }
}
```

### Trust Boundary

```
┌─────────────────────────────────────────────────────────────────┐
│                    UNTRUSTED ZONE                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                       APP                                │   │
│  │  - Can see requests scoped to itself                    │   │
│  │  - Can suggest organization/filtering                   │   │
│  │  - Can create new requests                              │   │
│  │  - CANNOT approve/deny requests                         │   │
│  │  - CANNOT see requests for other apps                   │   │
│  └─────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                    TRUSTED ZONE                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              FRAME + POPUP                               │   │
│  │  - Controlled by Federise (org app)                     │   │
│  │  - Actually stores and grants permissions               │   │
│  │  - Shows user the real request details                  │   │
│  │  - User makes final decision here                       │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Invitation with Permission Requests

When accepting an invitation, the invitee can request additional permissions:

```typescript
interface AcceptInvitationRequest {
  token: string;
  displayName: string;

  // Request additional permissions beyond what invitation grants
  additionalRequests?: {
    capabilities?: Capability[];
    reason?: string;
  };
}

interface AcceptInvitationResponse {
  identity: Identity;
  credential: { type: 'api_key'; secret: string };

  // What was immediately granted (from invitation)
  grants: GrantSummary[];

  // What is pending approval (from additionalRequests)
  pendingRequests?: PermissionRequest[];
}
```

---

## Revocation

### Revocation Strategies by Token Type

| Token Type | Revocation Method | Latency |
|------------|-------------------|---------|
| API Key | Delete from KV | Immediate |
| Bearer Token | Short expiry (no revocation) OR revocation list | Immediate / Low |
| Resource Token | Rotate resource secret | Immediate (all tokens) |
| Share Token | Revocation list OR rotate secret | Low / Immediate |
| Invitation | Mark as used/revoked in KV | Immediate |
| Refresh Token | Revocation list | Low |

### Revocation List

```typescript
interface RevocationEntry {
  tokenId: string;            // Or pattern for bulk revocation
  revokedAt: number;
  revokedBy: string;
  reason?: string;
  expiresAt: number;          // When entry can be cleaned up
}

// Storage: KV with prefix __REVOKED:
// __REVOKED:token:{tokenId} → RevocationEntry
// __REVOKED:identity:{identityId} → RevocationEntry (revoke all tokens)
// __REVOKED:credential:{credentialId} → RevocationEntry
```

### Bulk Revocation

```typescript
interface BulkRevocationRequest {
  // Revoke by scope
  identityId?: string;         // All tokens for this identity
  credentialId?: string;       // All tokens from this credential
  resourceId?: string;         // All tokens for this resource

  // Or specific tokens
  tokenIds?: string[];

  reason?: string;
}
```

---

## Storage Schema

### KV Keys

```
# Identities
__IDENTITY:{identityId}                    → Identity

# Credentials
__CREDENTIAL:{credentialId}                → Credential
__CRED_BY_HASH:{secretHash}               → credentialId (for API key lookup)
__CREDS_FOR:{identityId}                  → credentialId[] (list credentials)

# Capability Grants
__GRANT:{grantId}                         → CapabilityGrant
__GRANTS_FOR:{identityId}                 → grantId[]

# Invitations
__INVITATION:{invitationId}               → InvitationRecord
__INVITES_BY:{identityId}                 → invitationId[]

# Revocations
__REVOKED:token:{tokenId}                 → RevocationEntry
__REVOKED:identity:{identityId}           → RevocationEntry
__REVOKED:credential:{credentialId}       → RevocationEntry

# Token tracking (optional, for use-limited tokens)
__TOKEN_USES:{tokenId}                    → { count: number, limit: number }
```

### Migration from Current Schema

```
# Current
__PRINCIPAL:{secretHash} → { display_name, created_at, active }

# New
__IDENTITY:{id}          → { id, type, displayName, status, ... }
__CREDENTIAL:{id}        → { id, identityId, type, secretHash, status, ... }
__CRED_BY_HASH:{hash}    → credentialId

# Migration: On first access of old principal
1. Create new Identity from principal data
2. Create Credential linking to Identity
3. Store bidirectional mapping
4. Old key continues to work (lookup by hash)
```

---

## API Endpoints

### Identity Management

```
POST   /identity/create           Create new identity (requires capability)
GET    /identity/{id}             Get identity details
PATCH  /identity/{id}             Update identity
DELETE /identity/{id}             Suspend/delete identity
GET    /identity/me               Get current identity from auth context
```

### Credential Management

```
POST   /credential/create         Create new credential for identity
GET    /credential/list           List credentials for identity
POST   /credential/{id}/rotate    Start rotation (create new, mark old rotating)
DELETE /credential/{id}           Revoke credential
```

### Token Management

```
POST   /token/bearer              Create bearer token for current identity
POST   /token/refresh             Exchange refresh token for new bearer
POST   /token/revoke              Revoke a token by ID

# Resource tokens created via resource-specific endpoints
POST   /channel/{id}/token        Create channel access token
POST   /blob/token                Create blob access token
```

### Invitation Management

```
POST   /invitation/create         Create invitation
GET    /invitation/list           List pending invitations
DELETE /invitation/{id}           Revoke invitation
POST   /invitation/accept         Accept invitation (creates identity)
```

---

## Security Considerations

### Token Security

- All tokens signed with HMAC-SHA256 (minimum)
- Truncated signatures acceptable for short-lived tokens (12 bytes = 96 bits)
- Full signatures for long-lived or high-value tokens (32 bytes = 256 bits)
- Timing-safe comparison for all signature verification
- Tokens never logged in full (only ID or truncated)

### Credential Security

- API keys: 256 bits of entropy, stored as SHA-256 hash
- Key rotation: grace period where both old and new work
- Automatic expiry warnings for long-lived credentials
- Rate limiting on failed authentication attempts

### Invitation Security

- Invitations are one-time use (stored state required)
- Short default expiry (7 days)
- Capability grants capped by inviter's own capabilities
- Invitations can be revoked before use

### Defense in Depth

```
┌─────────────────────────────────────────────────────┐
│ Layer 1: SDK                                        │
│   - Format validation only                          │
│   - NO security enforcement                         │
├─────────────────────────────────────────────────────┤
│ Layer 2: Frame/Proxy                                │
│   - Origin validation                               │
│   - User consent for capabilities                   │
│   - Rate limiting per origin                        │
├─────────────────────────────────────────────────────┤
│ Layer 3: Gateway                                    │
│   - Authentication (credential verification)        │
│   - Authorization (capability + scope check)        │
│   - Rate limiting per identity                      │
│   - Audit logging                                   │
├─────────────────────────────────────────────────────┤
│ Layer 4: Storage                                    │
│   - Namespace isolation (defense, not primary)      │
│   - Resource-level access checks                    │
└─────────────────────────────────────────────────────┘
```

---

## Migration Path

### Phase 1: Identity Separation
1. Add Identity type alongside Principal
2. Add Credential type
3. Auto-migrate principals on access
4. Both schemas work simultaneously

### Phase 2: Bearer Tokens
1. Implement bearer token creation/verification
2. Add `Authorization: Bearer` support to middleware
3. Bearer tokens work alongside API keys

### Phase 3: Invitations
1. Implement invitation token creation
2. Add acceptance flow
3. UI for creating/managing invitations

### Phase 4: Credential Management
1. Support multiple credentials per identity
2. Implement key rotation flow
3. Add credential scoping

### Phase 5: Unified Token Format
1. Migrate resource tokens to unified format
2. Add share token enhancements
3. Deprecate V1/V2/V3 log tokens (keep verification support)

### Phase 6: Full Authorization
1. Implement capability grants
2. Gateway-level permission enforcement
3. Audit logging for all access

---

## Frame Authentication (Apps)

Apps authenticate through the frame, not directly to the gateway. This creates a unique authentication model.

### App Connection Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     THIRD-PARTY APP                              │
│                   (https://notes.example.com)                    │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                │ 1. App loads SDK
                                │ 2. SDK creates iframe to /frame
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FRAME (Trusted)                              │
│                   (https://federise.example/frame)               │
│                                                                  │
│  3. Frame validates app origin                                  │
│  4. Checks: Does this app have 'frame:connect' grant?           │
│  5. Checks: Does user have grants for this app?                 │
│  6. Builds AppAuthContext                                       │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                │ 7. Frame makes request on app's behalf
                                │ 8. Includes AppAuthContext in request
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     GATEWAY                                      │
│                                                                  │
│  9. Validates frame's authentication                            │
│  10. Applies AppAuthContext effective capabilities              │
│  11. Enforces intersection: app ∩ user ∩ user-grant-to-app     │
└─────────────────────────────────────────────────────────────────┘
```

### App Capabilities

Apps need specific capabilities to connect and operate:

```typescript
type AppCapability =
  // Connection
  | 'frame:connect'           // Can connect via /frame endpoint

  // Permission requests
  | 'permission_request:view:own'
  | 'permission_request:view:count'
  | 'permission_request:view:details'
  | 'permission_request:filter'
  | 'permission_request:create'

  // Standard capabilities (same as users, but scoped)
  | 'kv:read' | 'kv:write' | 'kv:delete'
  | 'blob:read' | 'blob:write'
  | 'channel:read' | 'channel:append' | 'channel:create' | 'channel:share'
  | /* ... */;
```

### Effective Capabilities for Apps

When an app makes a request, the effective capabilities are the **intersection** of three sets:

```typescript
function getAppEffectiveCapabilities(
  app: AppIdentity,
  actingUser: Identity,
  userAppGrant: AppGrant  // What user granted to this specific app
): Capability[] {
  // 1. What the app is allowed to do (globally)
  const appCapabilities = app.grantedCapabilities;

  // 2. What the user can do
  const userCapabilities = getIdentityCapabilities(actingUser);

  // 3. What the user has granted to this app
  const grantedToApp = userAppGrant.capabilities;

  // Effective = intersection of all three
  return intersection(appCapabilities, userCapabilities, grantedToApp);
}
```

**Example:**
- App has: `['channel:read', 'channel:append', 'blob:read']`
- User has: `['channel:read', 'channel:append', 'channel:create', 'blob:read', 'blob:write']`
- User granted to app: `['channel:read', 'channel:append']`
- **Effective**: `['channel:read', 'channel:append']`

### App Identity Registration

Apps are registered as identities when first connecting:

```typescript
interface AppRegistration {
  origin: string;              // https://notes.example.com
  displayName: string;         // "Notes App"

  // Requested capabilities (shown to user)
  requestedCapabilities: Capability[];

  // Manifest (optional, for app store listing)
  manifest?: {
    description?: string;
    iconUrl?: string;
    privacyPolicyUrl?: string;
    supportUrl?: string;
  };
}

// When user first authorizes an app:
interface AppGrant {
  appOrigin: string;
  userId: string;

  // Subset of requested capabilities user approved
  grantedCapabilities: Capability[];

  // Optional restrictions
  restrictions?: {
    namespaces?: string[];     // Only these namespaces
    resources?: string[];      // Only these resources
    expiresAt?: string;        // Grant expires
  };

  createdAt: string;
  lastUsedAt?: string;
}
```

### Frame Trust Model

The frame is the **trust anchor** for app authentication:

```
┌─────────────────────────────────────────────────────────────────┐
│                    TRUST LEVELS                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  FULLY TRUSTED:                                                 │
│  ├─ Gateway (server-side, authoritative)                        │
│  └─ Frame/Popup (Federise-controlled UI)                        │
│                                                                  │
│  CONDITIONALLY TRUSTED:                                         │
│  └─ Apps (trusted within their granted capabilities)            │
│                                                                  │
│  UNTRUSTED:                                                     │
│  └─ Anonymous token holders                                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

The frame **never** trusts an app to:
- Declare its own origin (frame detects via postMessage event.origin)
- Claim capabilities it hasn't been granted
- Act as a different user
- Approve permission requests

---

## Open Questions

### Resolved in This Document

1. ~~**Anonymous vs Pseudonymous**~~ → Multiple token types: fully anonymous (stateless share), pseudonymous (authorId tracking), or identity-requiring
2. ~~**Cross-Principal Sharing**~~ → Yes, via permission request system and resource-level grants
3. ~~**Token Transparency**~~ → Yes, tokens should be introspectable (holder can decode their permissions)

### Still Open

1. **Identity Federation**: Support for external IdP (OAuth, OIDC)?
   - Would allow "Sign in with Google" etc.
   - Complicates identity model

2. **Capability Ceiling**: Should there be system-wide limits on what any single identity can do?
   - Prevents runaway resource usage
   - But may be better handled by rate limits

3. **Offline Tokens**: How do tokens work with local-first/offline scenarios?
   - Can tokens be verified without network?
   - How to sync permission changes?

4. **Multi-Tenancy**: Separate identity namespaces per deployment?
   - Isolated identity pools per customer
   - Shared vs tenant-specific apps

5. **Delegation Chains**: How deep can delegation go?
   - A shares to B, B shares to C, C shares to D...
   - Revocation propagation complexity

6. **Permission Request UX**: How to handle many pending requests?
   - Batching, grouping, auto-approval rules?
   - App-assisted organization (described above)

7. **Resource Policy Defaults**: What should the default access policy be?
   - Most restrictive (deny all)?
   - Moderately open (owner + authenticated)?
   - Per-resource-type defaults?

8. **Token Introspection Endpoint**: Should there be an API to check token validity?
   - Useful for apps to verify tokens they receive
   - Privacy considerations (token holder info)

9. **Audit Log Access**: Who can read audit logs?
   - Identity can see their own actions?
   - Apps can see actions in their scope?
   - Admin-only?

10. **App Trust Levels**: Should some apps be "verified" or "trusted"?
    - Different capability ceilings for verified vs unverified apps
    - App store / marketplace implications

---

## Appendix: Token Format Details

### Bearer Token Binary Layout

```
Offset  Size  Field
0       1     Version (0x01)
1       1     Type (0x01 = bearer)
2       8     Identity ID (truncated hash)
10      2     Capabilities bitmap
12      4     Expires at (Unix timestamp, uint32)
16      12    Signature (HMAC-SHA256 truncated)
---
Total: 28 bytes = ~38 characters base64url
```

### Resource Token Binary Layout

```
Offset  Size  Field
0       1     Version (0x01)
1       1     Type (0x02 = resource)
2       1     Resource type (0x01=channel, 0x02=blob, 0x03=kv)
3       6     Resource ID (truncated)
9       1     Permissions bitmap
10      4     Issuer ID (truncated)
14      2     Author ID (for tracking)
16      3     Expires at (hours since epoch, uint24)
19      12    Signature
---
Total: 31 bytes = ~42 characters base64url
```

### Invitation Token Binary Layout

```
Offset  Size  Field
0       1     Version (0x01)
1       1     Type (0x04 = invitation)
2       8     Invitation ID
10      8     Inviter Identity ID
18      4     Grants encoding (compressed)
22      4     Expires at (Unix timestamp)
26      16    Signature (full length for security)
---
Total: 42 bytes = ~56 characters base64url
```

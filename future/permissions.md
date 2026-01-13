# Permissions Architecture

## Current State

### Current Capabilities

```typescript
type Capability =
  | 'kv:read'        // Read any KV key in app's namespace
  | 'kv:write'       // Write any KV key in app's namespace
  | 'kv:delete'      // Delete any KV key in app's namespace
  | 'blob:read'      // Read any blob in app's namespace
  | 'blob:write'     // Upload/modify any blob in app's namespace
  | 'log:create'     // Create logs and append/read events
  | 'log:delete'     // Delete logs
  | 'notifications'; // Reserved
```

### Current Namespace Convention

```
Format: origin_{SHA256(origin)}
Example: origin_a1b2c3d4e5f6789...  (71 characters)
Storage key format: {namespace}:{key}
```

**Problems:**
1. Opaque - can't tell which app owns what
2. No hierarchy - can't have sub-namespaces
3. No sharing - app can only access its own namespace
4. No global data - no shared/public namespaces

### Current Enforcement Points

| Layer | Enforces | Mechanism |
|-------|----------|-----------|
| **SDK** | Nothing | Passes messages to Frame |
| **Frame/Proxy** | Capability check | `hasCapability(origin, cap)` before forwarding |
| **Gateway** | API Key validity | Auth middleware validates key |
| **Storage** | Nothing | Trusts namespaced keys |

**Problems:**
1. Gateway trusts any valid API key for any namespace
2. No per-resource permissions (all-or-nothing per capability)
3. Malicious frame could bypass permissions
4. No enforcement in gateway for namespace boundaries

## Design Goals

1. **Readable namespaces** - Human-understandable namespace names
2. **Hierarchical namespaces** - Support for sub-namespaces
3. **Cross-app sharing** - Apps can grant access to other apps
4. **Global namespaces** - Shared/public data spaces
5. **Granular permissions** - Per-key, per-resource access control
6. **Defense in depth** - Enforcement at multiple layers
7. **Admin access** - Privileged access across namespaces
8. **Safeguards** - Prevent privilege escalation

## Namespace Redesign

### Namespace Types

```typescript
enum NamespaceType {
  APP = 'app',            // app:{origin-hash}
  USER = 'user',          // user:{user-id}
  SHARED = 'shared',      // shared:{namespace-name}
  PUBLIC = 'public',      // public:{namespace-name}
  SYSTEM = 'system',      // system:{component}
  NAMED = 'named',        // {custom-name}
}
```

### Namespace Naming Convention

```
Format: {type}:{identifier}[/{sub-namespace}]*

Examples:
  app:a1b2c3d4                    # App's default namespace (shortened hash)
  app:a1b2c3d4/cache              # App's cache sub-namespace
  user:u_abc123                   # User's personal namespace
  shared:team-workspace           # Shared team namespace
  public:assets                   # Publicly readable namespace
  system:config                   # System configuration
```

### Namespace Types

```typescript
interface Namespace {
  type: NamespaceType;
  identifier: string;
  subPath?: string[];
  fullPath: string;            // Canonical form: "app:abc123/cache"
}

interface NamespaceOwnership {
  namespace: string;
  ownerType: 'app' | 'user' | 'principal' | 'system';
  ownerId: string;
  createdAt: string;
  permissions: NamespacePermissions;
}
```

## Permission Model

### Permission Structure

```typescript
interface Permission {
  resource: 'kv' | 'blob' | 'log' | 'namespace' | '*';
  namespace: string | string[];  // "app:abc123", "shared:*", ["app:abc", "app:def"]
  keys?: string | string[];      // "user:*", "config/*", ["settings", "preferences"]
  operations: Operation[];       // ['read'], ['read', 'write'], ['*']
}

type Operation =
  | 'read'
  | 'write'
  | 'delete'
  | 'list'
  | 'create'
  | 'admin'
  | '*';
```

### Permission Grant Model

```typescript
interface PermissionGrant {
  id: string;

  grantorType: 'user' | 'app' | 'system';
  grantorId: string;

  granteeType: 'app' | 'user' | 'token';
  granteeId: string;

  permissions: Permission[];

  constraints?: {
    expiresAt?: string;
    maxUses?: number;
    ipAllowlist?: string[];
    refererAllowlist?: string[];
  };

  createdAt: string;
  reason?: string;
}
```

## Multi-Layer Enforcement

- **SDK Layer**: Validates request format, provides typed API. NO security enforcement.
- **Proxy/Frame Layer**: Verifies app origin, checks capability grants, resolves namespace, enforces rate limits. FIRST LINE OF DEFENSE.
- **Gateway Layer**: Validates API key/token, enforces namespace boundaries (NEW), checks fine-grained permissions (NEW), enforces rate limits, audit logging. AUTHORITATIVE ENFORCEMENT.
- **Storage Layer**: Namespace isolation in key structure. NO active enforcement.

**Principle: Defense in Depth**
- SDK checks are hints (improve UX, can be bypassed)
- Proxy checks are first line (user consent, app isolation)
- Gateway checks are authoritative (server-side, can't be bypassed)

## Cross-App Permissions

### Share Namespace Request

```typescript
interface ShareNamespaceRequest {
  sourceNamespace: string;
  sourceKeys?: string;
  targetAppOrigin: string;
  permissions: Operation[];
  expiresAt?: string;
  maxUses?: number;
}
```

### Accessing Shared Namespace

```typescript
interface NamespaceInfo {
  namespace: string;
  type: 'own' | 'shared';
  permissions: string[];
  sharedBy?: string;
}
```

## Global/Shared Namespaces

### Public Namespaces
Readable by any app without explicit grant. Write controlled by owner.

### Shared Namespaces
Require explicit membership. Members can have different permission levels.

### System Namespaces
Reserved for platform use. Only accessible by system components.
- `system:config` - Platform configuration
- `system:principals` - Principal records
- `system:permissions` - Permission grants
- `system:audit` - Audit logs

## Admin Access

### Admin Roles

```typescript
enum AdminRole {
  SUPER_ADMIN = 'super_admin',     // Full access to everything
  NAMESPACE_ADMIN = 'ns_admin',    // Manage specific namespace(s)
  USER_ADMIN = 'user_admin',       // Manage users/principals
  AUDIT_ADMIN = 'audit_admin',     // Read audit logs
  READ_ONLY_ADMIN = 'ro_admin',    // Read anything, write nothing
}

interface AdminGrant {
  principalId: string;
  role: AdminRole;
  scope?: {
    namespaces?: string[];
  };
  grantedBy: string;
  grantedAt: string;
  expiresAt?: string;
}
```

### Admin Capabilities

```typescript
type AdminCapability =
  | 'admin:namespace:create'
  | 'admin:namespace:delete'
  | 'admin:namespace:manage'
  | 'admin:principal:create'
  | 'admin:principal:delete'
  | 'admin:principal:list'
  | 'admin:audit:read'
  | 'admin:data:read'
  | 'admin:data:write'
  | 'admin:data:delete';
```

## Safeguards

### Privilege Escalation Prevention
- Cannot grant more than you have
- Cannot grant admin without being super_admin
- Cannot access system namespaces without system role

### Rate Limiting by Permission Level

```typescript
interface RateLimitTiers {
  app: { requestsPerMinute: 100, requestsPerHour: 1000 };
  shared: { requestsPerMinute: 50, requestsPerHour: 500 };
  crossApp: { requestsPerMinute: 20, requestsPerHour: 200 };
  admin: { requestsPerMinute: 10, requestsPerHour: 100, requiresAudit: true };
}
```

### Dangerous Operation Protections
Operations requiring additional confirmation:
- `namespace:delete` - Deleting entire namespace
- `admin:data:delete` - Admin deleting data
- `permission:grant:admin` - Granting admin rights

### Permission Expiry and Review

```typescript
interface PermissionReviewPolicy {
  defaultExpiry: {
    crossApp: '7d';
    shared: '30d';
    admin: '1d';
  };
  reviewReminders: { enabled: boolean; daysBeforeExpiry: number[] };
  unusedGrantRevocation: { enabled: boolean; unusedDays: number };
}
```

## Updated Capability Set

```typescript
type Capability =
  // KV Operations
  | 'kv:read' | 'kv:write' | 'kv:delete'
  // Blob Operations
  | 'blob:read' | 'blob:write'
  // Log Operations (split for granularity)
  | 'log:read' | 'log:write' | 'log:create' | 'log:delete' | 'log:share'
  // Namespace Operations (NEW)
  | 'namespace:list' | 'namespace:create' | 'namespace:share' | 'namespace:admin'
  // Cross-App Operations (NEW)
  | 'cross:read' | 'cross:write'
  // Notifications
  | 'notifications';
```

## Storage Schema

```typescript
// Storage keys for permissions:
// __PERM:app:{origin-hash} → PermissionGrant[]
// __NS_MEMBERS:{namespace} → { members: NamespaceMember[] }
// __ADMIN:{principal-id} → AdminGrant[]
// __GRANT:{grant-id} → PermissionGrant
// __GRANTS_BY:{grantee-type}:{grantee-id} → string[] (grant IDs)
```

## Migration Path

### Phase 1: Namespace Naming
1. Introduce new namespace format alongside legacy
2. Auto-migrate legacy namespaces on access
3. Store bidirectional mappings

### Phase 2: Fine-Grained Permissions
1. Add Permission type and grant storage
2. Update capability check to use new model
3. Map existing capabilities to permissions

### Phase 3: Gateway Enforcement
1. Add permission middleware to gateway
2. Validate namespace access at gateway level
3. Add audit logging for all access

### Phase 4: Cross-App Sharing
1. Add namespace sharing API
2. Implement approval flow UI
3. Add shared namespace access in SDK

### Phase 5: Admin System
1. Implement admin roles and grants
2. Add admin-specific audit trail
3. Build admin UI in org app

## Open Questions

1. **Permission Inheritance**: Should sub-namespace access inherit from parent?
2. **Delegation Depth**: Can App B re-share access that App A granted?
3. **Revocation Propagation**: How quickly must revocations take effect?
4. **Offline Access**: How do permissions work with local-first storage?
5. **Group Permissions**: Should we support permission groups/roles?
6. **Temporary Elevation**: "sudo" style temporary admin access?

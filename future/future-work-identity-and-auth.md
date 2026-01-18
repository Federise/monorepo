# Future Work: Identity, Authentication & Authorization Extensions

This document tracks ideas for future extensions to the identity and authentication system that were identified during planning and implementation but deemed out of scope for the initial release.

---

## Identity Federation

### OAuth/OIDC Integration
- Support "Sign in with Google/GitHub/etc."
- Map external identities to Federise identities
- Store external IdP tokens for API access

```typescript
interface FederatedIdentity extends Identity {
  type: 'user';
  federatedProvider?: {
    provider: 'google' | 'github' | 'microsoft' | 'custom';
    externalId: string;
    email?: string;
    accessToken?: string;  // Encrypted
    refreshToken?: string; // Encrypted
    tokenExpiresAt?: string;
  };
}
```

### SAML Support
- Enterprise SSO integration
- Service provider implementation
- Attribute mapping to grants

---

## Multi-Tenancy

### Tenant Isolation
- Separate identity pools per tenant
- Tenant-specific configurations
- Cross-tenant identity linking (opt-in)

```typescript
interface Tenant {
  id: string;
  name: string;
  domain?: string;  // Custom domain mapping
  settings: TenantSettings;
}

interface TenantSettings {
  allowedIdentityTypes: IdentityType[];
  defaultGrants: CapabilityGrant[];
  maxIdentitiesPerUser: number;
  requireMFA: boolean;
}
```

### Tenant Administration
- Tenant admin role
- Tenant-scoped identity management
- Usage quotas per tenant

---

## Audit Logging

### Comprehensive Access Logging
- All authentication attempts (success/failure)
- All authorization decisions
- All resource access with context
- IP address, user agent, geo-location

```typescript
interface AuditEvent {
  id: string;
  timestamp: string;

  // Actor
  identityId?: string;
  credentialId?: string;
  tokenId?: string;
  appOrigin?: string;
  ipAddress?: string;
  userAgent?: string;
  geoLocation?: { country: string; region: string };

  // Action
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  namespace?: string;

  // Result
  outcome: 'success' | 'denied' | 'error';
  errorCode?: string;
  errorMessage?: string;

  // Context
  durationMs?: number;
  requestSize?: number;
  responseSize?: number;
}

enum AuditAction {
  // Auth
  AUTH_ATTEMPT = 'auth.attempt',
  AUTH_SUCCESS = 'auth.success',
  AUTH_FAILURE = 'auth.failure',
  AUTH_MFA_CHALLENGE = 'auth.mfa_challenge',
  AUTH_MFA_VERIFY = 'auth.mfa_verify',

  // Identity
  IDENTITY_CREATE = 'identity.create',
  IDENTITY_UPDATE = 'identity.update',
  IDENTITY_SUSPEND = 'identity.suspend',
  IDENTITY_DELETE = 'identity.delete',

  // Credential
  CREDENTIAL_CREATE = 'credential.create',
  CREDENTIAL_ROTATE = 'credential.rotate',
  CREDENTIAL_REVOKE = 'credential.revoke',

  // Token
  TOKEN_CREATE = 'token.create',
  TOKEN_USE = 'token.use',
  TOKEN_REVOKE = 'token.revoke',

  // Grant
  GRANT_CREATE = 'grant.create',
  GRANT_REVOKE = 'grant.revoke',

  // Invitation
  INVITATION_CREATE = 'invitation.create',
  INVITATION_ACCEPT = 'invitation.accept',
  INVITATION_REVOKE = 'invitation.revoke',

  // Data access
  KV_READ = 'kv.read',
  KV_WRITE = 'kv.write',
  KV_DELETE = 'kv.delete',
  BLOB_READ = 'blob.read',
  BLOB_WRITE = 'blob.write',
  BLOB_DELETE = 'blob.delete',
  CHANNEL_READ = 'channel.read',
  CHANNEL_WRITE = 'channel.write',
  CHANNEL_CREATE = 'channel.create',
  CHANNEL_DELETE = 'channel.delete',
}
```

### Audit Configuration
- Configurable retention periods
- Configurable log destinations (KV, external webhook, S3)
- Compliance modes (GDPR, SOC2, HIPAA)

### Audit Access
- Identity can view their own audit log
- Admin can view all audit logs
- Export capabilities for compliance

---

## Rate Limiting

### Per-Identity Rate Limits
- Configurable requests per minute/hour
- Burst allowance
- Graduated throttling

```typescript
interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
  burstSize: number;

  // Per-operation overrides
  operationLimits?: {
    [operation: string]: {
      requestsPerMinute?: number;
      requestsPerHour?: number;
    };
  };
}

interface RateLimitState {
  identityId: string;
  windowStart: number;
  requestCount: number;
  lastRequest: number;
}
```

### Per-Token Rate Limits
- Token-embedded rate limits
- More restrictive than identity limits
- Per-resource bandwidth limits

### Rate Limit Headers
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 842
X-RateLimit-Reset: 1640000000
X-RateLimit-RetryAfter: 30
```

---

## Permission Request System

### App-Initiated Permission Requests
- Apps can request additional capabilities
- Users approve/deny via trusted UI (popup)
- Granular request/grant flow

```typescript
interface PermissionRequest {
  id: string;

  // Requester
  requesterId: string;
  requesterType: IdentityType;
  appOrigin?: string;

  // What's requested
  requested: {
    capabilities?: Capability[];
    resources?: ResourceGrant[];
    namespaces?: NamespaceGrant[];
  };

  // Context
  reason?: string;
  userContext?: string;  // "User is trying to share a document"

  // Status
  status: 'pending' | 'approved' | 'denied' | 'expired';
  createdAt: string;
  expiresAt: string;

  // Resolution
  resolvedAt?: string;
  resolvedBy?: string;
  grantedSubset?: PermissionGrant[];
}
```

### App Permission Capabilities
```typescript
type PermissionRequestCapability =
  | 'permission_request:view:own'      // See requests scoped to this app
  | 'permission_request:view:count'    // See count of pending requests
  | 'permission_request:view:details'  // See full request details
  | 'permission_request:filter'        // Suggest filtering in popup
  | 'permission_request:create';       // Create requests on behalf of users
```

### SDK Integration
```typescript
// In SDK
await federise.requestPermission({
  capabilities: ['blob:write'],
  reason: 'To save your document',
});
// Returns Promise that resolves when approved/denied
```

---

## Offline Tokens

### Local Token Verification
- Tokens verifiable without network
- Embedded public key in token
- Ed25519 signatures for asymmetric verification

```typescript
interface OfflineToken extends Token {
  // Additional fields for offline use
  publicKeyId: string;      // Which key to verify against
  publicKey?: Uint8Array;   // Embedded public key (optional)

  // Asymmetric signature
  signatureAlgorithm: 'ed25519';
  signature: Uint8Array;    // Ed25519 signature
}
```

### Key Distribution
- Public keys cached locally
- Key rotation announced via channel
- Fallback to online verification

### Sync Considerations
- Permission changes sync when online
- Revocations sync with delay
- Grace period for offline tokens

---

## Delegation Chains

### Deep Delegation
- A shares to B, B shares to C, C shares to D
- Track full delegation chain
- Configurable maximum depth

```typescript
interface DelegationChain {
  depth: number;
  chain: DelegationLink[];
}

interface DelegationLink {
  fromIdentity: string;
  toIdentity: string;
  tokenId: string;
  grantedAt: string;
  restrictions?: PermissionRestriction[];
}
```

### Revocation Propagation
- Revoking A→B revokes entire chain
- Configurable propagation delay
- Audit trail for revocations

### Delegation Constraints
- Maximum chain depth (default: 3)
- Permission attenuation (can only reduce permissions)
- Time limits on delegated tokens

---

## MFA (Multi-Factor Authentication)

### TOTP Support
- Time-based one-time passwords
- Standard authenticator app support
- Recovery codes

```typescript
interface MFAConfig {
  enabled: boolean;
  method: 'totp' | 'webauthn' | 'sms';

  // TOTP specific
  totpSecret?: string;  // Encrypted
  recoveryCodes?: string[];  // Encrypted

  // WebAuthn specific
  webauthnCredentials?: WebAuthnCredential[];
}

interface MFAChallenge {
  challengeId: string;
  method: 'totp' | 'webauthn';
  expiresAt: string;
  verified: boolean;
}
```

### WebAuthn Support
- Hardware security key support
- Platform authenticators (TouchID, FaceID)
- Passwordless authentication

### Conditional MFA
- Required for sensitive operations
- Optional for regular access
- Per-credential MFA requirements

---

## Service Accounts

### Service Identity Management
- Long-lived service credentials
- Minimal required permissions
- Automatic credential rotation

```typescript
interface ServiceIdentity extends Identity {
  type: 'service';

  serviceConfig: {
    purpose: string;           // "CI/CD pipeline"
    owner: string;             // Owning identity
    allowedIpRanges?: string[]; // IP restrictions
    maxTokenLifetime?: number; // Limit bearer token duration
    autoRotateCredentials?: {
      enabled: boolean;
      intervalDays: number;
    };
  };
}
```

### Service Monitoring
- Track service credential usage
- Alert on anomalous behavior
- Automatic suspension on abuse

---

## Token Introspection

### Token Introspection Endpoint
- Verify token validity externally
- Get token metadata
- Privacy-preserving responses

```typescript
// POST /token/introspect
interface IntrospectRequest {
  token: string;
}

interface IntrospectResponse {
  active: boolean;
  tokenType?: string;
  scope?: string[];
  expiresAt?: string;
  issuedAt?: string;

  // Only if authorized to see
  identityId?: string;
  identityType?: string;
}
```

### Token Info for Holders
- Token holders can decode their own tokens
- See permissions, constraints, expiry
- Self-service token management

---

## App Verification & Trust Levels

### App Verification Process
- Developer registration
- App review and approval
- Verified badge display

```typescript
interface AppVerification {
  appOrigin: string;
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
  verifiedAt?: string;
  verifiedBy?: string;
  trustLevel: 'untrusted' | 'basic' | 'verified' | 'partner';

  // Verified app benefits
  maxCapabilities?: Capability[];  // Higher limits for verified apps
  prioritySupport?: boolean;
  featuredInDirectory?: boolean;
}
```

### Trust-Based Capability Ceilings
- Unverified apps: basic capabilities only
- Verified apps: extended capabilities
- Partner apps: full capabilities

---

## Emergency Access

### Break-Glass Procedure
- Emergency admin access
- Requires multiple approvers
- Full audit trail

```typescript
interface EmergencyAccessRequest {
  requesterId: string;
  reason: string;
  requestedScope: string[];

  // Approvals required
  approvers: string[];
  approvalStatus: Map<string, 'pending' | 'approved' | 'denied'>;

  // If granted
  grantedAt?: string;
  expiresAt?: string;  // Short duration
  usageLog?: EmergencyUsageEntry[];
}
```

### Post-Incident Review
- All emergency access reviewed
- Automatic incident creation
- Follow-up actions tracked

---

## Implementation Notes

### Priority Order
1. Rate Limiting (high impact, moderate complexity)
2. Audit Logging (compliance requirement)
3. MFA (security improvement)
4. Permission Request System (user experience)
5. Identity Federation (enterprise feature)
6. Rest (as needed)

### Dependencies
- Rate Limiting: requires identity system (Phase 1)
- Audit Logging: requires identity + token system (Phase 2)
- Permission Request: requires grants system (Phase 6)
- Federation: requires identity + invitation system (Phase 3)

### Breaking Changes
- MFA: may require auth flow changes
- Federation: adds complexity to identity model
- Deep Delegation: may impact token size

---

*Last updated: Initial planning for identity-and-auth implementation*

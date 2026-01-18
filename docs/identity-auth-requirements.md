# Identity, Authentication & Authorization - Formal Requirements

## Document Overview

This document defines the formal requirements, implementation checklist, and development plan for the Federise identity and authentication system as specified in `future/identity-and-auth.md`.

**Supersedes**: `future/auth.md`, `future/permissions.md` (consolidated into this unified spec)

---

## Current State Summary

### What Exists Today

| Component | Implementation | Location |
|-----------|---------------|----------|
| Principal (API Key) | SHA-256 hashed, stored in KV | `packages/gateway-core/src/middleware/auth.ts` |
| Bootstrap Key | Special first-principal creation | `packages/gateway-core/src/endpoints/principal/` |
| Channel Tokens | V1-V4 HMAC-SHA256 signed | `packages/gateway-core/src/lib/channel-token.ts` |
| Proxy Capabilities | Origin-based with cookie store | `packages/proxy/src/` |
| Namespace Isolation | SHA-256 origin hash | `packages/proxy/src/namespace.ts` |

### Current Limitations

1. **Identity = API Key**: Can't rotate keys without losing identity
2. **No identity types**: Can't distinguish humans from services
3. **All-or-nothing access**: Every principal is a superuser
4. **No invitation flow**: Must use bootstrap key to create principals
5. **No delegation**: Can't grant limited access to others
6. **Single auth method**: API key only, no bearer tokens
7. **No resource-level authorization**: Namespace-only scoping

---

## Requirements Specification

### REQ-1: Identity Model

#### REQ-1.1: Identity Types
- [ ] **REQ-1.1.1**: Support `USER` identity type (human account owner)
- [ ] **REQ-1.1.2**: Support `SERVICE` identity type (automated service/bot)
- [ ] **REQ-1.1.3**: Support `AGENT` identity type (AI acting on behalf of user)
- [ ] **REQ-1.1.4**: Support `APP` identity type (third-party frame-mediated app)
- [ ] **REQ-1.1.5**: Support `ANONYMOUS` identity type (token-based access only)

#### REQ-1.2: Identity Structure
- [ ] **REQ-1.2.1**: Each identity has globally unique `id` (prefixed: `ident_`)
- [ ] **REQ-1.2.2**: Each identity has `type` from IdentityType enum
- [ ] **REQ-1.2.3**: Each identity has `displayName` (human-readable)
- [ ] **REQ-1.2.4**: Each identity has `createdAt` timestamp
- [ ] **REQ-1.2.5**: Each identity has optional `createdBy` (parent identity)
- [ ] **REQ-1.2.6**: Each identity has `status`: active | suspended | deleted
- [ ] **REQ-1.2.7**: Each identity has optional `metadata` object

#### REQ-1.3: Identity Hierarchy
- [ ] **REQ-1.3.1**: SYSTEM identity can create USER identities
- [ ] **REQ-1.3.2**: USER identities can create SERVICE, AGENT, APP identities
- [ ] **REQ-1.3.3**: APP identities can issue ANONYMOUS tokens
- [ ] **REQ-1.3.4**: Identity hierarchy is tracked via `createdBy` field

#### REQ-1.4: APP Identity Specifics
- [ ] **REQ-1.4.1**: APP identity has `origin` field (URL origin)
- [ ] **REQ-1.4.2**: APP identity has `originHash` (SHA-256 of origin)
- [ ] **REQ-1.4.3**: APP identity has `grantedCapabilities` array
- [ ] **REQ-1.4.4**: APP identity has `frameAccess` boolean

### REQ-2: Authentication Model

#### REQ-2.1: Credential Types
- [ ] **REQ-2.1.1**: Support `API_KEY` credential type (long-lived secret)
- [ ] **REQ-2.1.2**: Support `BEARER_TOKEN` credential type (time-limited)
- [ ] **REQ-2.1.3**: Support `REFRESH_TOKEN` credential type (for obtaining new bearer)
- [ ] **REQ-2.1.4**: Support `INVITATION` credential type (one-time use)

#### REQ-2.2: Credential Structure
- [ ] **REQ-2.2.1**: Each credential has unique `id` (prefixed: `cred_`)
- [ ] **REQ-2.2.2**: Each credential has `identityId` (foreign key to identity)
- [ ] **REQ-2.2.3**: Each credential has `type` from CredentialType enum
- [ ] **REQ-2.2.4**: API_KEY credentials have `secretHash` (SHA-256)
- [ ] **REQ-2.2.5**: Each credential has `status`: active | rotating | revoked
- [ ] **REQ-2.2.6**: Each credential has `createdAt` timestamp
- [ ] **REQ-2.2.7**: Each credential has optional `expiresAt` timestamp
- [ ] **REQ-2.2.8**: Each credential has optional `lastUsedAt` timestamp
- [ ] **REQ-2.2.9**: Each credential has optional `scope` restrictions

#### REQ-2.3: Credential Scope
- [ ] **REQ-2.3.1**: Scope can restrict to specific capabilities
- [ ] **REQ-2.3.2**: Scope can restrict to specific namespaces
- [ ] **REQ-2.3.3**: Scope can restrict to specific resources
- [ ] **REQ-2.3.4**: Scope can have earlier expiry than credential

#### REQ-2.4: Authentication Flow
- [ ] **REQ-2.4.1**: Support `Authorization: ApiKey <key>` header
- [ ] **REQ-2.4.2**: Support `Authorization: Bearer <token>` header
- [ ] **REQ-2.4.3**: ApiKey auth: hash lookup in KV
- [ ] **REQ-2.4.4**: Bearer auth: signature verification (stateless)
- [ ] **REQ-2.4.5**: Build AuthContext with identity + effective capabilities

### REQ-3: Token Architecture

#### REQ-3.1: Unified Token Format
- [ ] **REQ-3.1.1**: All tokens share common binary structure
- [ ] **REQ-3.1.2**: Token has version byte (for format evolution)
- [ ] **REQ-3.1.3**: Token has type byte (bearer, resource, share, invitation)
- [ ] **REQ-3.1.4**: Token has scope (resource type, id, permissions bitmap)
- [ ] **REQ-3.1.5**: Token has constraints (time, use, rate limits)
- [ ] **REQ-3.1.6**: Token has HMAC-SHA256 signature (12-16 bytes)

#### REQ-3.2: Permission Bitmaps
- [ ] **REQ-3.2.1**: PERM_READ = 0x01 (read/view/download)
- [ ] **REQ-3.2.2**: PERM_WRITE = 0x02 (write/append/upload)
- [ ] **REQ-3.2.3**: PERM_DELETE = 0x04 (delete)
- [ ] **REQ-3.2.4**: PERM_LIST = 0x08 (list/enumerate)
- [ ] **REQ-3.2.5**: PERM_ADMIN = 0x10 (administrative actions)
- [ ] **REQ-3.2.6**: PERM_SHARE = 0x20 (create share tokens)
- [ ] **REQ-3.2.7**: PERM_DELEGATE = 0x40 (delegate to others)
- [ ] **REQ-3.2.8**: Resource-specific permissions in bits 8-15

#### REQ-3.3: Token Types
- [ ] **REQ-3.3.1**: Bearer Token: stateless, time-limited, identity auth
- [ ] **REQ-3.3.2**: Resource Token: stateless, time-limited, resource auth
- [ ] **REQ-3.3.3**: Share Token: stateless/stateful, delegatable, resource auth
- [ ] **REQ-3.3.4**: Invitation Token: stateful, one-time, identity creation
- [ ] **REQ-3.3.5**: Refresh Token: stateful, long-lived, token renewal

#### REQ-3.4: Token Constraints
- [ ] **REQ-3.4.1**: Support `issuedAt` timestamp
- [ ] **REQ-3.4.2**: Support `expiresAt` hard expiry
- [ ] **REQ-3.4.3**: Support `slidingWindowSeconds` (extend on use)
- [ ] **REQ-3.4.4**: Support `maxUses` (requires state)
- [ ] **REQ-3.4.5**: Support `rateLimit` (per minute/hour/bandwidth)
- [ ] **REQ-3.4.6**: Support `canDelegate` boolean
- [ ] **REQ-3.4.7**: Support `maxDelegationDepth` limit
- [ ] **REQ-3.4.8**: Support `requiresStateCheck` flag for revocation

### REQ-4: Invitation Flow

#### REQ-4.1: Invitation Creation
- [ ] **REQ-4.1.1**: Create invitation with pre-configured capability grants
- [ ] **REQ-4.1.2**: Create invitation with namespace grants
- [ ] **REQ-4.1.3**: Create invitation with resource grants
- [ ] **REQ-4.1.4**: Set invitation expiry (default 7 days)
- [ ] **REQ-4.1.5**: Set invitation max uses (default 1)
- [ ] **REQ-4.1.6**: Return shareable URL with token

#### REQ-4.2: Invitation Acceptance
- [ ] **REQ-4.2.1**: Accept invitation with display name
- [ ] **REQ-4.2.2**: Accept invitation with optional identity type
- [ ] **REQ-4.2.3**: Create new identity with pre-configured grants
- [ ] **REQ-4.2.4**: Return API key (one-time display)
- [ ] **REQ-4.2.5**: Mark invitation as used

#### REQ-4.3: Invitation State Machine
- [ ] **REQ-4.3.1**: States: PENDING → ACCEPTED | EXPIRED | REVOKED
- [ ] **REQ-4.3.2**: Expired invitations cannot be accepted
- [ ] **REQ-4.3.3**: Revoked invitations cannot be accepted
- [ ] **REQ-4.3.4**: Accepted invitations cannot be reused

### REQ-5: Authorization Model

#### REQ-5.1: Capability Grants
- [ ] **REQ-5.1.1**: Grant has unique `grantId`
- [ ] **REQ-5.1.2**: Grant links to `identityId`
- [ ] **REQ-5.1.3**: Grant specifies `capability` (e.g., 'kv:read')
- [ ] **REQ-5.1.4**: Grant has optional scope restrictions
- [ ] **REQ-5.1.5**: Grant has `grantedAt` and `grantedBy` fields
- [ ] **REQ-5.1.6**: Grant has optional `expiresAt` field
- [ ] **REQ-5.1.7**: Grant has `source`: direct | invitation | delegation | system

#### REQ-5.2: Effective Permissions
- [ ] **REQ-5.2.1**: Start with identity's capability grants
- [ ] **REQ-5.2.2**: Intersect with credential scope (if restricted)
- [ ] **REQ-5.2.3**: Intersect with token claims (if token-based auth)
- [ ] **REQ-5.2.4**: Result is effective permissions for request

#### REQ-5.3: Resource-Level Authorization
- [ ] **REQ-5.3.1**: Resources can define their own access policies
- [ ] **REQ-5.3.2**: Policy defines public access (read/write/list)
- [ ] **REQ-5.3.3**: Policy defines authenticated access
- [ ] **REQ-5.3.4**: Policy defines per-action requirements
- [ ] **REQ-5.3.5**: Actions can require: none | identity | grant | owner

### REQ-6: Revocation

#### REQ-6.1: Revocation Methods
- [ ] **REQ-6.1.1**: API Key: delete from KV (immediate)
- [ ] **REQ-6.1.2**: Bearer Token: short expiry OR revocation list
- [ ] **REQ-6.1.3**: Resource Token: rotate resource secret (all tokens)
- [ ] **REQ-6.1.4**: Share Token: revocation list OR rotate secret
- [ ] **REQ-6.1.5**: Invitation: mark as used/revoked in KV
- [ ] **REQ-6.1.6**: Refresh Token: revocation list

#### REQ-6.2: Revocation List
- [ ] **REQ-6.2.1**: Store revocation entries in KV with prefix `__REVOKED:`
- [ ] **REQ-6.2.2**: Entry has tokenId, revokedAt, revokedBy, reason
- [ ] **REQ-6.2.3**: Entry has expiresAt for cleanup
- [ ] **REQ-6.2.4**: Support bulk revocation by identity/credential/resource

### REQ-7: Storage Schema

#### REQ-7.1: KV Key Patterns
- [ ] **REQ-7.1.1**: `__IDENTITY:{identityId}` → Identity
- [ ] **REQ-7.1.2**: `__CREDENTIAL:{credentialId}` → Credential
- [ ] **REQ-7.1.3**: `__CRED_BY_HASH:{secretHash}` → credentialId
- [ ] **REQ-7.1.4**: `__CREDS_FOR:{identityId}` → credentialId[]
- [ ] **REQ-7.1.5**: `__GRANT:{grantId}` → CapabilityGrant
- [ ] **REQ-7.1.6**: `__GRANTS_FOR:{identityId}` → grantId[]
- [ ] **REQ-7.1.7**: `__INVITATION:{invitationId}` → InvitationRecord
- [ ] **REQ-7.1.8**: `__REVOKED:token:{tokenId}` → RevocationEntry
- [ ] **REQ-7.1.9**: `__TOKEN_USES:{tokenId}` → { count, limit }

#### REQ-7.2: Migration
- [ ] **REQ-7.2.1**: Support both old `__PRINCIPAL:` and new schemas
- [ ] **REQ-7.2.2**: Auto-migrate principals on access
- [ ] **REQ-7.2.3**: Bidirectional mapping during transition

### REQ-8: API Endpoints

#### REQ-8.1: Identity Management
- [ ] **REQ-8.1.1**: `POST /identity/create` - create new identity
- [ ] **REQ-8.1.2**: `GET /identity/{id}` - get identity details
- [ ] **REQ-8.1.3**: `PATCH /identity/{id}` - update identity
- [ ] **REQ-8.1.4**: `DELETE /identity/{id}` - suspend/delete identity
- [ ] **REQ-8.1.5**: `GET /identity/me` - get current identity

#### REQ-8.2: Credential Management
- [ ] **REQ-8.2.1**: `POST /credential/create` - create new credential
- [ ] **REQ-8.2.2**: `GET /credential/list` - list credentials for identity
- [ ] **REQ-8.2.3**: `POST /credential/{id}/rotate` - start rotation
- [ ] **REQ-8.2.4**: `DELETE /credential/{id}` - revoke credential

#### REQ-8.3: Token Management
- [ ] **REQ-8.3.1**: `POST /token/bearer` - create bearer token
- [ ] **REQ-8.3.2**: `POST /token/refresh` - exchange refresh for bearer
- [ ] **REQ-8.3.3**: `POST /token/revoke` - revoke token by ID

#### REQ-8.4: Invitation Management
- [ ] **REQ-8.4.1**: `POST /invitation/create` - create invitation
- [ ] **REQ-8.4.2**: `GET /invitation/list` - list pending invitations
- [ ] **REQ-8.4.3**: `DELETE /invitation/{id}` - revoke invitation
- [ ] **REQ-8.4.4**: `POST /invitation/accept` - accept invitation

### REQ-9: Security

#### REQ-9.1: Token Security
- [ ] **REQ-9.1.1**: All tokens signed with HMAC-SHA256 (minimum)
- [ ] **REQ-9.1.2**: Truncated signatures acceptable for short-lived tokens
- [ ] **REQ-9.1.3**: Full signatures for long-lived/high-value tokens
- [ ] **REQ-9.1.4**: Timing-safe comparison for all verification
- [ ] **REQ-9.1.5**: Tokens never logged in full

#### REQ-9.2: Credential Security
- [ ] **REQ-9.2.1**: API keys: 256 bits of entropy
- [ ] **REQ-9.2.2**: Keys stored as SHA-256 hash
- [ ] **REQ-9.2.3**: Key rotation: grace period for both old and new
- [ ] **REQ-9.2.4**: Rate limiting on failed auth attempts

#### REQ-9.3: Invitation Security
- [ ] **REQ-9.3.1**: Invitations are one-time use (stored state)
- [ ] **REQ-9.3.2**: Short default expiry (7 days)
- [ ] **REQ-9.3.3**: Grants capped by inviter's capabilities
- [ ] **REQ-9.3.4**: Invitations can be revoked before use

### REQ-10: Frame/App Authentication

#### REQ-10.1: App Connection Flow
- [ ] **REQ-10.1.1**: App loads SDK, SDK creates iframe to /frame
- [ ] **REQ-10.1.2**: Frame validates app origin
- [ ] **REQ-10.1.3**: Frame checks app's `frame:connect` grant
- [ ] **REQ-10.1.4**: Frame checks user's grants for this app
- [ ] **REQ-10.1.5**: Frame builds AppAuthContext

#### REQ-10.2: Effective App Capabilities
- [ ] **REQ-10.2.1**: Intersection of app's granted capabilities
- [ ] **REQ-10.2.2**: Intersection of user's capabilities
- [ ] **REQ-10.2.3**: Intersection of user's grant to this specific app
- [ ] **REQ-10.2.4**: Result is effective capabilities for request

#### REQ-10.3: Frame Trust Model
- [ ] **REQ-10.3.1**: Frame never trusts app to declare its own origin
- [ ] **REQ-10.3.2**: Frame never trusts app to claim ungranted capabilities
- [ ] **REQ-10.3.3**: Frame never trusts app to act as different user
- [ ] **REQ-10.3.4**: Frame never trusts app to approve permission requests

---

## Implementation Phases

### Phase 1: Identity Separation (Foundation)
**Goal**: Separate identity from credentials, maintain backward compatibility

**Tasks**:
1. [ ] Create `Identity` type and schema
2. [ ] Create `Credential` type and schema
3. [ ] Implement `__IDENTITY:` and `__CREDENTIAL:` KV storage
4. [ ] Implement `__CRED_BY_HASH:` lookup index
5. [ ] Update auth middleware to resolve credential → identity
6. [ ] Auto-migrate principals on access (lazy migration)
7. [ ] Add `/identity/me` endpoint
8. [ ] Write unit tests for identity CRUD
9. [ ] Write unit tests for credential CRUD
10. [ ] Write integration tests for migration

### Phase 2: Bearer Tokens
**Goal**: Add stateless bearer token authentication

**Tasks**:
1. [ ] Implement unified token format (binary encoding)
2. [ ] Implement bearer token creation
3. [ ] Implement bearer token verification
4. [ ] Add `Authorization: Bearer` support to middleware
5. [ ] Add `/token/bearer` endpoint
6. [ ] Write unit tests for token encoding/decoding
7. [ ] Write unit tests for token verification
8. [ ] Write integration tests for bearer auth flow

### Phase 3: Invitations
**Goal**: Enable user invitation flow

**Tasks**:
1. [ ] Implement invitation token format
2. [ ] Implement invitation storage schema
3. [ ] Implement `/invitation/create` endpoint
4. [ ] Implement `/invitation/accept` endpoint
5. [ ] Implement `/invitation/list` endpoint
6. [ ] Implement `/invitation/revoke` endpoint
7. [ ] Implement invitation state machine
8. [ ] Write unit tests for invitation flow
9. [ ] Write integration tests for full invite → accept flow

### Phase 4: Credential Management
**Goal**: Support multiple credentials per identity, rotation

**Tasks**:
1. [ ] Implement `__CREDS_FOR:` list storage
2. [ ] Implement `/credential/create` endpoint
3. [ ] Implement `/credential/list` endpoint
4. [ ] Implement `/credential/{id}/rotate` endpoint (grace period)
5. [ ] Implement `/credential/{id}/revoke` endpoint
6. [ ] Add credential scoping support
7. [ ] Write unit tests for multi-credential scenarios
8. [ ] Write integration tests for key rotation

### Phase 5: Unified Token Format
**Goal**: Migrate resource tokens to unified format

**Tasks**:
1. [ ] Implement generic Token type with all constraint types
2. [ ] Implement resource token in unified format
3. [ ] Implement share token in unified format
4. [ ] Update channel token to unified format
5. [ ] Add backward compatibility for V1-V4 tokens
6. [ ] Deprecate old formats (keep verification)
7. [ ] Write unit tests for each token type
8. [ ] Write migration tests

### Phase 6: Capability Grants & Authorization
**Goal**: Implement fine-grained capability grants

**Tasks**:
1. [ ] Implement CapabilityGrant type and storage
2. [ ] Implement `__GRANT:` and `__GRANTS_FOR:` storage
3. [ ] Implement grant resolution in auth flow
4. [ ] Implement effective permissions calculation
5. [ ] Add resource-level access policies
6. [ ] Add policy storage and resolution
7. [ ] Write unit tests for grant resolution
8. [ ] Write integration tests for authorization

### Phase 7: Revocation System
**Goal**: Implement token and credential revocation

**Tasks**:
1. [ ] Implement revocation list storage (`__REVOKED:`)
2. [ ] Implement revocation check in token verification
3. [ ] Implement `/token/revoke` endpoint
4. [ ] Implement bulk revocation
5. [ ] Implement revocation entry cleanup (expired entries)
6. [ ] Write unit tests for revocation
7. [ ] Write integration tests for revocation propagation

### Phase 8: Permission Request System (Future)
**Goal**: Enable apps to request additional permissions

**Deferred to**: future-work-identity-and-auth.md

---

## Test Plan

### Unit Tests

#### Identity Tests (`packages/gateway-core/src/lib/__tests__/identity.test.ts`)
- [ ] Create identity with all types
- [ ] Create identity with metadata
- [ ] Update identity status
- [ ] Identity hierarchy validation
- [ ] Invalid identity type rejection

#### Credential Tests (`packages/gateway-core/src/lib/__tests__/credential.test.ts`)
- [ ] Create API key credential
- [ ] Hash and verify API key
- [ ] Create scoped credential
- [ ] Credential status transitions
- [ ] Multiple credentials per identity

#### Token Tests (`packages/gateway-core/src/lib/__tests__/unified-token.test.ts`)
- [ ] Encode/decode bearer token
- [ ] Encode/decode resource token
- [ ] Encode/decode share token
- [ ] Encode/decode invitation token
- [ ] Permission bitmap operations
- [ ] Constraint validation
- [ ] Signature verification
- [ ] Expiry checking
- [ ] Backward compatibility with V1-V4

#### Grant Tests (`packages/gateway-core/src/lib/__tests__/grants.test.ts`)
- [ ] Create capability grant
- [ ] Grant with scope restrictions
- [ ] Grant expiration
- [ ] Effective permissions calculation
- [ ] Grant inheritance/intersection

### Integration Tests

#### Auth Flow Tests (`apps/gateway/test/auth-flow.test.ts`)
- [ ] Bootstrap → first identity creation
- [ ] Identity → credential creation
- [ ] ApiKey auth flow
- [ ] Bearer token auth flow
- [ ] Auth rejection scenarios

#### Invitation Flow Tests (`apps/gateway/test/invitation-flow.test.ts`)
- [ ] Create invitation with grants
- [ ] Accept invitation → new identity
- [ ] Expired invitation rejection
- [ ] Revoked invitation rejection
- [ ] Multiple-use invitation (when maxUses > 1)

#### Migration Tests (`apps/gateway/test/migration.test.ts`)
- [ ] Old principal auto-migrates
- [ ] Migrated principal works with new auth
- [ ] Both schemas work simultaneously

### E2E Tests

#### Full Flow Tests (`test/e2e/identity-auth.test.ts`)
- [ ] Create user → invite user → accept → collaborate
- [ ] App connection → capability check → request
- [ ] Token creation → use → revocation
- [ ] Key rotation with grace period

---

## Compatibility Considerations

### Backward Compatibility
1. **Principal Migration**: Existing principals auto-migrate on first access
2. **API Key Format**: Same 64-char hex format, same header format
3. **Channel Tokens**: V1-V4 tokens continue to work during transition
4. **Proxy Protocol**: No changes to SDK ↔ Frame protocol
5. **Storage**: Old `__PRINCIPAL:` keys coexist with new schema

### Breaking Changes (Future)
1. **V1-V3 Token Deprecation**: After Phase 5, warn on V1-V3 usage
2. **Bootstrap Key**: May be removed after invitation system is stable
3. **All-or-nothing Access**: Gradually require explicit grants

---

## Carve-outs for Future Work

The following are explicitly **out of scope** for initial implementation but designed to be addable:

1. **Identity Federation** (OAuth, OIDC integration)
2. **Multi-tenancy** (separate identity pools)
3. **Audit Logging** (comprehensive access logging)
4. **Rate Limiting** (per-identity, per-token)
5. **Permission Request System** (app-initiated permission requests)
6. **Offline Tokens** (local-first token verification)
7. **Delegation Chains** (A → B → C → D sharing)

See `future/future-work-identity-and-auth.md` for detailed specifications.

---

## Decision Log

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| Use HMAC-SHA256 for all tokens | Standard, fast, sufficient security | Ed25519 (asymmetric, more complex) |
| Truncate signatures to 12 bytes | Compact tokens, 96-bit security acceptable for short-lived | Full 32-byte (more secure but longer) |
| Lazy migration of principals | Zero-downtime upgrade, gradual rollout | Batch migration (downtime required) |
| Bearer tokens are stateless | Fast verification, no DB lookup | Stateful tokens (more control, slower) |
| Invitations are stateful | Must prevent reuse | Stateless with nonce (complex) |
| Identity and credential separation | Enables rotation, multiple auth methods | Keep combined (simpler, limited) |

---

## Success Criteria

### Phase 1 Complete When:
- [ ] New identity created without breaking existing principals
- [ ] Existing API keys continue to work
- [ ] `/identity/me` returns identity for authenticated request
- [ ] All existing E2E tests pass

### Phase 2 Complete When:
- [ ] Bearer token created and used for authentication
- [ ] Bearer token expires correctly
- [ ] Bearer token works alongside API key auth
- [ ] All existing E2E tests pass

### Phase 3 Complete When:
- [ ] Invitation created with grants
- [ ] Invitation accepted, new identity has grants
- [ ] Invitation cannot be reused
- [ ] New identity can perform granted operations

### Full Implementation Complete When:
- [ ] All REQ-* requirements checked off
- [ ] All test plan items passing
- [ ] Zero regressions in existing functionality
- [ ] Documentation updated

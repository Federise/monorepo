# Multi-Identity Vault Implementation Plan

## Overview

Transform the frame from single-credential storage to a multi-identity vault that manages relationships between identities, credentials, gateways, and capabilities.

## Current State Summary

### Storage (Single Identity)
```
localStorage:
  federise:gateway:apiKey  → single API key (plaintext)
  federise:gateway:url     → single gateway URL

cookies (for iframe):
  federise_gateway_apiKey  → same API key
  federise_gateway_url     → same gateway URL

KV (__ORG namespace):
  permissions → { [origin]: { capabilities, grantedAt, expiresAt } }
```

### Problem
When a user claims a shared identity, `ClaimFlow.svelte:153-154` **overwrites** existing credentials:
```typescript
localStorage.setItem('federise:gateway:url', gatewayUrl);
localStorage.setItem('federise:gateway:apiKey', result.secret);
```

This means:
- User loses access to their own gateway
- No way to have credentials for multiple gateways
- No way to select which identity to use for a capability

---

## Requirements Checklist

### Core Identity Vault

- [ ] **V1**: Design vault storage schema for multiple identities
- [ ] **V2**: Implement identity storage with gateway association
- [ ] **V3**: Store credential metadata (not just raw key): displayName, identityId, gatewayUrl, capabilities, referrer, createdAt
- [ ] **V4**: Support "primary" identity designation per gateway
- [ ] **V5**: Backward compatibility: migrate single-credential users to vault format

### Credential Management

- [ ] **C1**: API keys stored plaintext in vault (user's local storage)
- [ ] **C2**: API keys stored hashed (SHA-256) on gateway (for auth verification)
- [ ] **C3**: Credential tied to specific gateway URL
- [ ] **C4**: Credential tied to specific capability scope (e.g., channelId)
- [ ] **C5**: Track credential source: "owner" (self-created) vs "granted" (claimed from share)
- [ ] **C6**: Store referrer (app origin that initiated the grant)

### Gateway Association

- [ ] **G1**: Support multiple gateway URLs in vault
- [ ] **G2**: Each credential explicitly associated with one gateway
- [ ] **G3**: Gateway metadata: URL, displayName (optional), lastUsed
- [ ] **G4**: RemoteBackend can be instantiated per-gateway

### Capability Tracking

- [ ] **P1**: Track which capabilities an identity has (from gateway grants)
- [ ] **P2**: Track capability scope (e.g., `channel:read` on `ch_abc123`)
- [ ] **P3**: Query: "which identities have access to resource X?"
- [ ] **P4**: Query: "what permissions does identity Y have?"

### Claim Flow Updates

- [ ] **CF1**: ClaimFlow adds to vault instead of overwriting
- [ ] **CF2**: Show user what they're gaining access to (capability + scope)
- [ ] **CF3**: Store referrer URL (the app that shared the link)
- [ ] **CF4**: Handle case: user already has identity on this gateway
- [ ] **CF5**: Handle case: user already has this specific capability via different identity

### SDK Updates

- [ ] **S1**: `getIdentitiesForCapability(capability, resourceId?)` - list identities with access
- [ ] **S2**: `executeAs(identityId, operation)` - perform operation as specific identity
- [ ] **S3**: `getActiveIdentity()` - get currently selected identity
- [ ] **S4**: `setActiveIdentity(identityId)` - switch active identity
- [ ] **S5**: Frame protocol updates to support identity selection

### Org App - Identity Management UI

- [ ] **UI1**: "Third-Party Identities" page listing granted identities
- [ ] **UI2**: Show: displayName, gateway, capabilities, referrer, createdAt
- [ ] **UI3**: Revoke/delete a third-party identity locally
- [ ] **UI4**: Visual distinction between "owner" and "granted" identities
- [ ] **UI5**: Group identities by gateway

### DisplayName Normalization

- [ ] **DN1**: Identity has `displayName` (human-friendly, mutable)
- [ ] **DN2**: Identity has `id` (ident_xxx, immutable, unique)
- [ ] **DN3**: No "username" concept - only displayName + id
- [ ] **DN4**: DisplayName shown in all UI, id used for operations

### Testing

- [ ] **T1**: Unit tests for vault CRUD operations
- [ ] **T2**: Unit tests for identity-capability queries
- [ ] **T3**: E2E test: claim flow adds to vault without losing existing
- [ ] **T4**: E2E test: app queries identities for capability
- [ ] **T5**: E2E test: execute operation as specific identity
- [ ] **T6**: Migration test: single-credential → vault format

---

## Proposed Storage Schema

### Vault Entry (per identity)

```typescript
interface VaultEntry {
  // Identity info (from gateway)
  identityId: string;          // ident_xxx
  displayName: string;         // Human-friendly name
  identityType: IdentityType;  // user | service | agent | app | anonymous

  // Gateway association
  gatewayUrl: string;          // https://gateway.example.com
  gatewayDisplayName?: string; // Optional friendly name for the gateway

  // Credential (plaintext for use)
  apiKey: string;              // The actual API key

  // Capability scope
  capabilities: VaultCapability[];

  // Provenance
  source: 'owner' | 'granted';
  referrer?: string;           // Origin of app that granted (for 'granted')
  claimedAt?: string;          // When this was claimed
  createdAt: string;           // When added to vault

  // State
  isPrimary: boolean;          // Primary identity for this gateway
  lastUsedAt?: string;
}

interface VaultCapability {
  capability: string;          // e.g., "channel:read", "channel:write"
  resourceType?: string;       // e.g., "channel"
  resourceId?: string;         // e.g., "ch_abc123"
  grantedAt: string;
}
```

### Storage Keys

```
localStorage:
  federise:vault                    → JSON array of VaultEntry
  federise:vault:version            → Schema version for migrations

  // Legacy (kept for backward compat, read-only after migration)
  federise:gateway:apiKey           → (deprecated, migrate on first load)
  federise:gateway:url              → (deprecated, migrate on first load)
```

### Cookie Strategy

For iframe access, we need a different approach since we can't store complex JSON in cookies efficiently:

```
Option A: Store vault in KV (gateway-side)
  - Pro: Single source of truth
  - Con: Requires gateway access to read vault
  - Con: Chicken-and-egg: need credential to read vault

Option B: Encode active identity in cookie
  - Store full vault in localStorage (via Storage Access API)
  - Cookie only holds: active gateway URL + identity hint
  - Frame reads full vault after Storage Access granted

Option C: IndexedDB + Storage Access API
  - Better for larger data
  - Still subject to cross-origin restrictions

Recommendation: Option B - minimal cookie, full vault in localStorage
```

---

## Implementation Phases

### Phase 1: Foundation (Vault Storage Layer)

**Goal**: Implement vault storage without breaking existing functionality.

1. Create `packages/proxy/src/vault/` module:
   - `types.ts` - VaultEntry, VaultCapability interfaces
   - `storage.ts` - CRUD operations for vault
   - `migration.ts` - Migrate single-credential to vault
   - `queries.ts` - Query helpers (by gateway, by capability, etc.)

2. Create unit tests for vault operations

3. Integrate migration into frame initialization (FrameEnforcer)

4. Backward compat: `getGatewayApiKey()` returns primary identity's key

### Phase 2: Claim Flow Updates

**Goal**: Claims add to vault instead of overwriting.

1. Update `ClaimFlow.svelte`:
   - Import vault storage
   - On claim: add new VaultEntry
   - If first identity for gateway: mark as primary
   - If not first: keep existing primary, show choice UI?

2. Update claim result to include capability info from token

3. Add referrer tracking (pass through from share URL)

4. E2E test: claim doesn't lose existing credentials

### Phase 3: Frame Protocol Updates

**Goal**: Frame can serve multiple identities.

1. Update `MessageRouter` to accept identity selection:
   - New message type: `SELECT_IDENTITY`
   - Operations can specify `identityId` parameter
   - Default to primary identity for gateway if not specified

2. Update `RemoteBackend` to accept identity parameter:
   - Factory method: `createForIdentity(vaultEntry)`
   - Auth header uses specified identity's apiKey

3. New frame queries:
   - `GET_IDENTITIES_FOR_CAPABILITY` → list of identities
   - `GET_IDENTITY_CAPABILITIES` → capabilities for identity
   - `GET_VAULT_SUMMARY` → all identities grouped by gateway

### Phase 4: SDK Updates

**Goal**: Apps can query and select identities.

1. New SDK methods:
   ```typescript
   getIdentitiesForCapability(capability: string, resourceId?: string): Promise<IdentityInfo[]>
   executeAs<T>(identityId: string, operation: () => Promise<T>): Promise<T>
   getActiveIdentity(): Promise<IdentityInfo | null>
   setActiveIdentity(identityId: string): Promise<void>
   ```

2. IdentityInfo type (safe for apps, no secrets):
   ```typescript
   interface IdentityInfo {
     identityId: string;
     displayName: string;
     gatewayUrl: string;
     capabilities: { capability: string; resourceId?: string }[];
     source: 'owner' | 'granted';
   }
   ```

3. Update existing SDK methods to use active identity context

### Phase 5: Org App UI

**Goal**: Users can manage their identity vault.

1. New page: `/manage/identities` (or tab in existing manage)

2. Components:
   - `IdentityVault.svelte` - Main container
   - `IdentityCard.svelte` - Single identity display
   - `GatewayGroup.svelte` - Group identities by gateway

3. Features:
   - List all vault entries
   - Group by gateway
   - Show capabilities per identity
   - Delete/revoke locally
   - Set primary identity per gateway
   - Visual badge for source (owner vs granted)

### Phase 6: Gateway-Side Updates (if needed)

**Goal**: Gateway provides capability info in claim responses.

1. Update `/token/claim` response to include:
   - Granted capabilities
   - Resource scopes
   - Token label/description

2. Consider: `/identity/capabilities` endpoint
   - Given identityId, return all grants
   - Used by frame to refresh capability cache

---

## Future Considerations (from ./future)

### Don't Paint Into Corner

1. **Credential rotation**: VaultEntry stores single apiKey, but design for multiple credentials per identity later

2. **Identity federation**: gatewayUrl might become a federation endpoint, not just direct gateway

3. **Offline tokens**: May need to store additional token types alongside apiKey

4. **Delegation chains**: Track who granted what to whom (A→B→C)

5. **Trust levels**: May need to store app verification status

### Explicit Non-Goals for This Implementation

- OAuth/OIDC integration (future phase)
- WebAuthn support (future phase)
- Multi-tenancy (future phase)
- Credential auto-rotation (future phase)

---

## Test Plan

### Unit Tests

```
packages/proxy/src/vault/__tests__/
├── storage.test.ts      # CRUD operations
├── migration.test.ts    # Single → vault migration
├── queries.test.ts      # Query helpers
└── types.test.ts        # Type validation
```

### Integration Tests

```
test/self-test/
├── vault-integration.test.ts  # Vault + frame + gateway
```

### E2E Tests

```
test/e2e/
├── vault-claim.test.ts        # Claim adds to vault
├── vault-identity-select.test.ts  # App selects identity
├── vault-migration.test.ts    # Migration from legacy
```

---

## Migration Strategy

### Detection
```typescript
function needsMigration(): boolean {
  const vault = localStorage.getItem('federise:vault');
  const legacyKey = localStorage.getItem('federise:gateway:apiKey');
  const legacyUrl = localStorage.getItem('federise:gateway:url');

  return !vault && legacyKey && legacyUrl;
}
```

### Migration
```typescript
function migrateToVault(): void {
  const apiKey = localStorage.getItem('federise:gateway:apiKey');
  const url = localStorage.getItem('federise:gateway:url');

  if (!apiKey || !url) return;

  const entry: VaultEntry = {
    identityId: 'unknown', // Will be resolved on next gateway call
    displayName: 'Primary Identity',
    identityType: 'user',
    gatewayUrl: url,
    apiKey: apiKey,
    capabilities: [],
    source: 'owner',
    createdAt: new Date().toISOString(),
    isPrimary: true,
  };

  localStorage.setItem('federise:vault', JSON.stringify([entry]));
  localStorage.setItem('federise:vault:version', '1');

  // Keep legacy keys for backward compat with older frame versions
  // Don't delete them yet
}
```

### Identity Resolution

After migration, we need to resolve the `identityId`:

```typescript
async function resolveIdentityId(entry: VaultEntry): Promise<string> {
  // Call gateway to get identity info for this credential
  const response = await fetch(`${entry.gatewayUrl}/identity/whoami`, {
    headers: { Authorization: `ApiKey ${entry.apiKey}` }
  });
  const { identityId, displayName } = await response.json();
  return identityId;
}
```

This requires a new endpoint: `/identity/whoami` that returns identity info for the authenticated credential.

---

## API Changes Summary

### New Gateway Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/identity/whoami` | GET | ApiKey | Return identity info for credential |
| `/identity/capabilities` | GET | ApiKey | Return all grants for identity |

### Updated Gateway Endpoints

| Endpoint | Change |
|----------|--------|
| `/token/claim` | Response includes capability grants |
| `/token/lookup` | Response includes capability preview |

### New SDK Methods

| Method | Purpose |
|--------|---------|
| `getIdentitiesForCapability()` | List identities with access to capability |
| `executeAs()` | Execute operation as specific identity |
| `getActiveIdentity()` | Get currently selected identity |
| `setActiveIdentity()` | Switch active identity |

### New Frame Messages

| Message | Direction | Purpose |
|---------|-----------|---------|
| `GET_IDENTITIES_FOR_CAPABILITY` | SDK→Frame | Query identities |
| `SELECT_IDENTITY` | SDK→Frame | Set active identity |
| `GET_VAULT_SUMMARY` | SDK→Frame | List all identities |

---

## File Changes Summary

### New Files

```
packages/proxy/src/vault/
├── index.ts
├── types.ts
├── storage.ts
├── migration.ts
├── queries.ts
└── __tests__/
    ├── storage.test.ts
    ├── migration.test.ts
    └── queries.test.ts

packages/gateway-core/src/endpoints/identity/
├── whoami.ts
├── capabilities.ts

apps/org/src/components/manage/
├── IdentityVault.svelte
├── IdentityCard.svelte
└── GatewayGroup.svelte

apps/org/src/pages/manage/
└── identities.astro

test/e2e/
├── vault-claim.test.ts
├── vault-identity-select.test.ts
└── vault-migration.test.ts
```

### Modified Files

```
packages/proxy/src/router.ts              # Identity selection support
packages/proxy/src/backends/remote.ts     # Per-identity backend
packages/sdk/src/client.ts                # New SDK methods
packages/sdk/src/types.ts                 # IdentityInfo type
apps/org/src/components/ClaimFlow.svelte  # Add to vault
apps/org/src/components/FrameEnforcer.svelte  # Run migration
apps/org/src/utils/auth.ts                # Vault-aware getters
packages/gateway-core/src/endpoints/token/claim.ts  # Include capabilities
packages/gateway-core/src/endpoints/token/lookup.ts # Include capability preview
```

---

---

## Demo App Changes

### Connection Model Rethink

The current demo has a single "connection" concept that conflates:
- Frame connectivity (can we talk to the frame?)
- Identity context (who am I acting as?)
- Capability grants (what can I do?)

**New Model:**
- **Frame Connection**: Establish communication with frame (unchanged)
- **Identity Context**: Which identity is active for operations
- **Capability Context**: What can the active identity do (derived from vault)

### Chat-Specific Identity Behavior

When accessing a channel, the app needs to:
1. Query which identities have access to that channel
2. If multiple identities: show identity selector
3. If single identity: auto-select
4. If no identity: show "no access" or prompt to claim

### Demo Requirements

- [ ] **D1**: Identity selector dropdown in chat header (when multiple identities)
- [ ] **D2**: Show active identity name in UI
- [ ] **D3**: Handle `/channel#token@gateway` URLs (token-based access)
- [ ] **D4**: Handle claimed identity context from URL navigation
- [ ] **D5**: Identity badge on messages showing which identity sent them
- [ ] **D6**: "Switch Identity" action when multiple available
- [ ] **D7**: Settings page shows vault summary (identities grouped by gateway)
- [ ] **D8**: Visual indicator when operating with "granted" vs "owner" identity

### Demo File Changes

```
apps/demo/src/
├── stores/
│   ├── federise.svelte.ts      # Add identity state, activeIdentity
│   └── identity.svelte.ts      # NEW: Identity vault queries
├── components/
│   ├── demos/Chat.svelte       # Identity selector, context-aware operations
│   ├── chat/
│   │   └── IdentitySelector.svelte  # NEW: Dropdown for identity selection
│   └── settings/
│       └── IdentityList.svelte      # NEW: Vault summary display
└── lib/
    └── identity.ts             # NEW: Identity helper types/functions
```

### URL Handling

**Token URL** (quick-link): `/channel#<token>@<base64gateway>`
- Token grants temporary access, no vault entry
- Operations use token auth, not identity

**Claim URL** (create-account): `/claim#<tokenId>@<base64gateway>@<base64return>`
- User claims identity, stored in vault
- Redirects back with new identity available
- App queries vault for channel access

### Chat Identity Flow

```
1. User navigates to /chat
2. App loads channel list (using primary identity)
3. User selects channel
4. App queries: getIdentitiesForCapability('channel:read', channelId)
5. If 0 identities: "No access" message
   If 1 identity: auto-select, load messages
   If N identities: show selector, user picks
6. Operations use selected identity
7. User can switch identity mid-session
```

### State Shape

```typescript
// apps/demo/src/stores/identity.svelte.ts
export interface IdentityState {
  // All identities from vault (via SDK)
  allIdentities: IdentityInfo[];

  // Active identity for current context
  activeIdentity: IdentityInfo | null;

  // Identities available for current channel
  channelIdentities: IdentityInfo[];

  // Loading states
  isLoading: boolean;
}
```

---

## Open Questions

1. **Primary identity per gateway or global?**
   - Recommendation: Per gateway. User may want different default identities for different services.

2. **What happens when primary identity is revoked/deleted?**
   - Auto-promote next identity to primary?
   - Require explicit user choice?

3. **Should vault be synced to gateway?**
   - Pro: Access from any device
   - Con: Complexity, privacy concerns (gateway sees all your identities)
   - Recommendation: Local-only for v1, consider sync later

4. **How to handle capability conflicts?**
   - Same capability from multiple identities: use most permissive? require explicit choice?
   - Recommendation: Require explicit identity selection when ambiguous

5. **Credential expiration in vault?**
   - Should vault track credential expiration?
   - Auto-remove expired entries?
   - Recommendation: Store expiresAt, show warning in UI, don't auto-remove

---

## Success Criteria

1. User can claim shared access without losing existing gateway credentials
2. User can see all their identities in org app UI
3. App can query which identities have access to a capability
4. App can execute operations as a specific identity
5. Existing single-credential users are seamlessly migrated
6. All existing tests continue to pass
7. New tests cover vault operations and multi-identity scenarios

# Comprehensive Architectural Review

**Date:** January 19, 2026
**Scope:** Full codebase review including apps, packages, requirements, and git history
**Purpose:** Identify misalignments, legacy code, and gaps between planned and implemented features

---

## Executive Summary

This review identifies **42 significant issues** across 6 categories:
1. **Terminology Drift** (Principal → Identity transition incomplete)
2. **Feature Parity Gaps** (Gateway capabilities not exposed in UIs)
3. **Type/Schema Mismatches** (SDK vs Gateway inconsistencies)
4. **Legacy Storage Patterns** (Old localStorage keys vs new vault system)
5. **Duplicate/Dead Code** (Parallel implementations for same features)
6. **Documentation Staleness** (Plans vs reality divergence)

**Critical Issues Requiring Immediate Attention:**
- Dual Principal/Identity systems create confusion and maintenance burden
- API schema in org app is severely outdated (missing ~30 endpoints)
- Demo app uses only 15% of identity management capabilities
- Vault system exists in proxy but not fully integrated

---

## Table of Contents

1. [High-Level Architecture Current State](#1-high-level-architecture-current-state)
2. [Terminology Transition Issues](#2-terminology-transition-issues-principal--identity)
3. [Demo App vs Gateway Capabilities](#3-demo-app-vs-gateway-capabilities)
4. [Org App vs Gateway Capabilities](#4-org-app-vs-gateway-capabilities)
5. [SDK vs Gateway Type Mismatches](#5-sdk-vs-gateway-type-mismatches)
6. [Legacy Storage and Code Patterns](#6-legacy-storage-and-code-patterns)
7. [Missing Features and Incomplete Implementations](#7-missing-features-and-incomplete-implementations)
8. [Documentation vs Implementation Gaps](#8-documentation-vs-implementation-gaps)
9. [Priority Matrix and Recommendations](#9-priority-matrix-and-recommendations)

---

## 1. High-Level Architecture Current State

### Component Relationships

```
Host Application (3rd party)
  ↓ imports
@federise/sdk (packages/sdk)
  ↓ postMessage
Frame (apps/org/frame.astro)
  ↓ uses
@federise/proxy (packages/proxy)
  ├─ MessageRouter → routes messages
  ├─ RemoteBackend → calls Gateway API
  └─ Vault storage → manages credentials (NEW, incomplete)
  ↓ HTTP
Gateway API (apps/gateway)
  ↓ uses
@federise/gateway-core (packages/gateway-core)
  └─ Endpoints, Identity/Credential/Grant systems
```

### Recent Major Changes (from git history)

| Commit | Change | Impact |
|--------|--------|--------|
| `1d3acd7` | Identity management system | NEW: Complete CRUD for identities, tokens, credentials |
| `72ea547` | @federise/proxy package | NEW: Extracted routing logic from FrameEnforcer |
| `65de093` | Log → Channel refactor | BREAKING: All "log" references renamed to "channel" |
| `327875a` | V3 Ultra-compact tokens | Token format: 25 bytes (~34 chars base64) |

---

## 2. Terminology Transition Issues (Principal → Identity)

### Current State: Two Parallel Systems

The codebase contains **BOTH** a legacy "Principal" system and a new "Identity" system operating simultaneously.

#### Files Still Using "Principal"

**Org App:**
- `apps/org/src/components/manage/PrincipalsManager.svelte` - Full 632-line component
- `apps/org/src/pages/manage/principals.astro` - Route still exists
- `apps/org/src/api/schema.ts` - `/principal/*` endpoints (lines 24-68)
- `apps/org/src/components/manage/Sidebar.svelte` (line 28) - Links to principals

**Tests:**
- `test/e2e/setup.ts` (lines 9-243) - All principal terminology
- `test/self-test/e2e-browser/e2e.spec.ts` (lines 140-226)
- `test/self-test/e2e-browser/sdk-frame.spec.ts` (lines 20-300)
- `apps/gateway/test/e2e.test.ts` (lines 13-271)

**Documentation:**
- `requirements/TESTING.md` (50+ lines)
- `requirements/ARCHITECTURE.md` - Multiple mentions
- `requirements/apps/gateway.md` - Principal endpoints documented
- `future/identity-and-auth.md` - Entire document uses "principal"

#### New Identity System

- `apps/org/src/components/manage/IdentitiesManager.svelte` - 1067 lines
- `packages/gateway-core/src/endpoints/identity/*` - Full CRUD endpoints
- `packages/proxy/src/vault/*` - Multi-identity vault storage

#### Impact

- **User Confusion:** Two different UIs for managing the same concept
- **Maintenance Burden:** Dual codepaths must be kept in sync
- **API Inconsistency:** Gateway has both `/principal/*` and `/identity/*` endpoints
- **Type Duplication:** Principal types and Identity types overlap

#### Recommendation

1. Deprecate PrincipalsManager.svelte with visible warning
2. Migrate all tests to use Identity terminology
3. Add deprecation warnings to `/principal/*` endpoints
4. Update all documentation to use Identity terminology

---

## 3. Demo App vs Gateway Capabilities

### Feature Coverage Summary

| Feature Category | Gateway Provides | SDK Exposes | Demo Uses | Coverage |
|------------------|-----------------|-------------|-----------|----------|
| Identity Management | 6 endpoints | Full API | IdentitySelector only | **15%** |
| Token Management | 4 endpoints | Partial | Create only | **25%** |
| KV Storage | 7 endpoints | Full API | Single ops only | **40%** |
| Blob Storage | 7 endpoints | Full API | Partial | **60%** |
| Channels | 8 endpoints | Full API | Good | **85%** |
| Short Links | 3 endpoints | None | None | **0%** |
| Real-time | Subscribe endpoint | Available | Not used | **0%** |

### Detailed Gaps

#### A. Identity Management (15% coverage)

**Gateway provides:**
- `POST /identity/whoami` - Get current identity
- `POST /identity/list` - List all identities
- `POST /identity/create` - Create identity
- `POST /identity/delete` - Delete identity
- `POST /identity/invite` - Invite user
- `POST /identity/app/register` - Register app

**Demo implements:**
- `IdentitySelector.svelte` - Displays identities with `channel:read` capability only

**Missing in Demo:**
- No identity creation UI
- No identity deletion UI
- No invite flow
- No comprehensive vault browser
- IdentitySelector filters only by `channel:read`, missing other capabilities

#### B. Token Management (25% coverage)

**Gateway provides:**
- `POST /token/lookup` - Look up token info
- `POST /token/claim` - Claim identity
- `POST /token/revoke` - Revoke token
- `POST /token/list` - List tokens

**Demo implements:**
- Channel token creation via SDK (Chat.svelte line 262-276)

**Missing in Demo:**
- No token history/list view
- No revocation UI
- No token lookup/inspection
- No expiry management

#### C. Short Links (0% coverage)

**Gateway provides:**
- `POST /short` - Create short link
- `DELETE /short/:id` - Delete short link
- `GET /short/:id` - Resolve short link

**Demo implements:**
- Manual base64 URL encoding for shares (Chat.svelte lines 271-276)

**Impact:** Share URLs are long and ugly; could be `federise.app/s/abc123`

#### D. Real-time Updates (0% coverage)

**Gateway provides:**
- `registerChannelSubscribeRoute()` for real-time channel updates

**Demo implements:**
- Polling every 3 seconds (Chat.svelte line 179)

**Impact:** 3-second latency for new messages; could be instant

### Hardcoded Values That Should Be Configurable

| Location | Value | Issue |
|----------|-------|-------|
| `federise.svelte.ts:6` | `DEFAULT_FRAME_URL = 'http://localhost:4321/frame'` | Dev hardcode |
| `Chat.svelte:55-61` | Expiry options (1, 7, 30, 90, 365 days) | Should come from gateway config |
| `Chat.svelte:107-110` | Meta event format (`__meta__`, `__chat__`) | Undocumented protocol |

---

## 4. Org App vs Gateway Capabilities

### API Schema Severely Outdated

**File:** `apps/org/src/api/schema.ts`

The TypeScript client schema is **auto-generated but from an old API specification**. It includes:

✓ `/ping`
✓ `/principal/*` (deprecated)
✓ `/kv/*`
✓ `/blob/*`

**Missing entirely (~30 endpoints):**
- All `/identity/*` endpoints
- All `/token/*` endpoints
- All `/channel/*` endpoints
- All `/shortlink/*` endpoints

**Impact:** TypeScript code has no types for new endpoints; leads to `fetch()` calls with manual typing.

### Management Pages Status

| Page | Status | Notes |
|------|--------|-------|
| `/manage/connection` | ✓ Complete | Gateway connection |
| `/manage/overview` | ⚠️ Incomplete | Shows "—" for most stats |
| `/manage/permissions` | ✓ Complete | App permissions |
| `/manage/data` | ✓ Complete | KV/Blob browser |
| `/manage/identities` | ⚠️ Partial | Missing invite, app registration |
| `/manage/principals` | ❌ Deprecated | Should redirect to identities |
| `/manage/tokens` | ❌ Missing | No token management |
| `/manage/channels` | ❌ Missing | No channel management |
| `/manage/credentials` | ❌ Missing | No API key rotation |
| `/manage/audit` | ❌ Missing | No activity logs |

### FrameEnforcer Protocol Gaps

**File:** `apps/org/src/components/FrameEnforcer.svelte`

The FrameEnforcer uses MessageRouter from @federise/proxy but lacks UI for:

- Identity selection (which identity to use for requests)
- Vault summary display to users
- Different token action types handling (identity_setup vs blob_access vs channel_access)
- Token action UI for `HANDLE_TOKEN` message type

### ClaimFlow Hardcoded API Calls

**File:** `apps/org/src/components/ClaimFlow.svelte` (lines 108-151)

Instead of using the API client, ClaimFlow makes direct `fetch()` calls:

```typescript
// Hardcoded endpoint calls instead of typed client
const lookupRes = await fetch(`${gatewayUrl}/token/lookup`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ tokenId }),
});
```

**Impact:** No TypeScript safety, brittle to API changes

---

## 5. SDK vs Gateway Type Mismatches

### Missing SDK Methods

| Gateway Endpoint | SDK Method | Status |
|------------------|------------|--------|
| `/identity/whoami` | None | ❌ Missing |
| `/identity/create` | None | ❌ Missing |
| `/identity/delete` | None | ❌ Missing |
| `/identity/list` | None | ❌ Missing |
| `/identity/invite` | None | ❌ Missing |
| `/identity/app/register` | None | ❌ Missing |
| `/token/revoke` | None | ❌ Missing |
| `/token/list` | None | ❌ Missing |

### Type Inconsistencies

#### A. Channel Permission Naming

**SDK** (`packages/sdk/src/types.ts` lines 58-69):
```typescript
type ChannelPermissionInput = 'read' | 'append' | 'delete' | 'write'; // includes legacy 'write'
```

**Gateway** (`packages/gateway-core/src/types.ts` lines 145-158):
```typescript
enum ChannelPermission { 'read' | 'append' | 'delete:own' | 'delete:any' | 'read:deleted' }
// No 'write', uses 'append' instead
```

**Issue:** SDK supports legacy `'write'` but gateway only accepts `'append'`

#### B. Error Code Type

**SDK** (`packages/sdk/src/types.ts` line 187):
```typescript
{ type: 'ERROR'; code: string; message: string }
```

**Gateway** (`packages/gateway-core/src/types.ts` lines 137-140):
```typescript
{ code: number; message: string }
```

**Issue:** String vs number for error codes

#### C. Channel Token Response

**SDK expects:**
```typescript
{ token: string; expiresAt: string; gatewayUrl: string }
```

**Gateway returns:**
```typescript
{ token: string; expiresAt: string }
// Missing gatewayUrl - added by proxy router
```

**Issue:** Proxy compensates but this is fragile

### Deprecated Types Still in SDK

| Type | File | Line | Replacement |
|------|------|------|-------------|
| `isPublic?: boolean` | types.ts | 23 | `visibility` |
| `isPublic?: boolean` | types.ts | 43 | `visibility` |
| `canWrite?: boolean` | channel-client.ts | 78 | `canAppend` |

---

## 6. Legacy Storage and Code Patterns

### LocalStorage Keys (Old vs New)

**Old Keys (still in use):**
- `federise:gateway:apiKey` - Single API key storage
- `federise:gateway:url` - Single gateway URL

**New Vault System:**
- `packages/proxy/src/vault/types.ts` defines `LEGACY_API_KEY` and `LEGACY_GATEWAY_URL` constants
- Vault stores multiple identities per gateway
- Migration function exists but not universally applied

**Files still using old keys:**

| File | Lines | Usage |
|------|-------|-------|
| `apps/org/src/utils/auth.ts` | 16-17 | Direct access |
| `apps/org/src/components/LoginButton.svelte` | 5-6 | Direct access |
| `apps/org/src/components/ClaimFlow.svelte` | 210-211 | Sets after claim |
| `apps/org/src/components/manage/Sidebar.svelte` | 38-39 | Direct access |
| `apps/org/src/components/manage/IdentitiesManager.svelte` | 10-11 | Direct access |
| `apps/org/src/components/manage/PrincipalsManager.svelte` | 6-7 | Direct access |
| `test/e2e/setup.ts` | 87-88 | Test setup |
| `test/self-test/e2e-browser/*.spec.ts` | Multiple | Test setup |

### KV Key Prefixes

**Old Prefix:** `__PRINCIPAL:` (still used in apps/self/*)
**New Prefix:** `__IDENTITY:` (defined in gateway-core)

Files using old prefix:
- `apps/self/src/main.ts` (line 161)
- `apps/self/src/endpoints/admin/check.ts` (lines 86-87)
- `apps/org/src/components/manage/Recovery.svelte` (line 178)

### Token Format Legacy Support

The SDK maintains backward compatibility for V1-V4 token formats:

```typescript
// packages/sdk/src/channel-client.ts lines 219-271
decodeV1Token() // ~200+ chars JSON (deprecated)
decodeV2Token() // Binary format
// V3 is current (25 bytes)
```

**Recommendation:** Document V3 as stable, deprecate V1/V2 with timeline

---

## 7. Missing Features and Incomplete Implementations

### Vault System (Incomplete)

**What exists:**
- `packages/proxy/src/vault/types.ts` - Schema definitions
- `packages/proxy/src/vault/storage.ts` - CRUD operations
- `packages/proxy/src/vault/migration.ts` - Legacy migration
- `packages/proxy/src/vault/queries.ts` - Capability queries

**What's missing:**
- Integration with FrameEnforcer
- UI for vault management in org app
- Migration trigger in auth flow
- Tests for vault operations

### Channel Invitations (Incomplete)

**Gateway supports:** `POST /identity/invite` creates claimable identities with channel permissions

**UI missing:**
- No page to list channels and create invitations
- No permission selector (which capabilities to grant)
- No expiration configuration
- No shareable link generation

### Real-time Subscriptions (Not Used)

**Gateway has:** `registerChannelSubscribeRoute()` for push updates

**Apps use:** Polling (3-second intervals in demo app)

---

## 8. Documentation vs Implementation Gaps

### Plans That Haven't Been Implemented

**File:** `docs/plans/multi-identity-vault.md`

The plan describes 6 phases of vault implementation. Current status:
- Phase 1 (Storage Foundation): **Partially complete** - types exist, integration incomplete
- Phase 2 (Claim Flow Updates): **Not started** - ClaimFlow still uses old storage
- Phase 3 (Frame Protocol): **Not started** - No identity selection in frame
- Phase 4 (SDK Updates): **Partial** - Types exist, methods don't
- Phase 5 (Org App UI): **Not started** - No vault UI page
- Phase 6 (Gateway Updates): **Partial** - whoami endpoint created

### Requirements Not Met

**From `docs/identity-auth-requirements.md`:**

| Requirement | Status |
|-------------|--------|
| Identity ≠ Credential separation | ✓ Implemented |
| Bearer token support | ❌ Not implemented |
| Invitation flow | ⚠️ Partial (backend only) |
| Credential rotation | ❌ Not implemented |
| Capability grants (fine-grained) | ❌ Not implemented |
| Revocation system | ⚠️ Partial (backend only) |

### Stale Documentation

| Document | Issue |
|----------|-------|
| `requirements/ARCHITECTURE.md` | Uses "principal" terminology |
| `requirements/TESTING.md` | References principal endpoints |
| `requirements/apps/gateway.md` | Principal documentation |
| `CLAUDE.md` Test procedure | Works but uses manual localStorage setup |

---

## 9. Priority Matrix and Recommendations

### Critical (Fix Immediately)

| Issue | Impact | Effort | Files |
|-------|--------|--------|-------|
| Regenerate API schema | No TS types for 30+ endpoints | Low | `apps/org/src/api/schema.ts` |
| Remove PrincipalsManager | Dual UIs confuse users | Medium | Multiple |
| Complete vault migration in ClaimFlow | Credentials overwritten | Medium | `ClaimFlow.svelte` |

### High Priority (Fix Soon)

| Issue | Impact | Effort | Files |
|-------|--------|--------|-------|
| Add token management UI | Can't revoke shared access | Medium | New page needed |
| Add identity CRUD to SDK | Missing core functionality | Medium | `packages/sdk/src/client.ts` |
| Update localStorage to vault | Legacy storage inconsistent | High | 10+ files |
| Add channel invite UI | Can't share channels properly | Medium | New page needed |

### Medium Priority (Next Sprint)

| Issue | Impact | Effort | Files |
|-------|--------|--------|-------|
| Use short links for shares | Ugly URLs | Low | `Chat.svelte` |
| Add real-time subscriptions | 3-sec latency | Medium | Demo app |
| Deprecate V1/V2 tokens | Tech debt | Low | Documentation |
| Fix error code types | Type safety | Low | SDK types |
| Add presigned visibility | Missing blob feature | Low | Demo Files.svelte |

### Low Priority (Backlog)

| Issue | Impact | Effort | Files |
|-------|--------|--------|-------|
| Update all docs to "identity" | Consistency | Medium | Many docs |
| Add vault UI page | Nice to have | Medium | New page |
| KV bulk operations in demo | Power user feature | Low | Demo Notes.svelte |
| Add audit logging | Compliance | High | New system |

---

## Appendix A: Files Requiring Changes

### Must Update (Critical Path)

```
apps/org/src/api/schema.ts                    # Regenerate from OpenAPI
apps/org/src/components/ClaimFlow.svelte      # Use vault storage
apps/org/src/components/manage/Sidebar.svelte # Remove principals link
apps/org/src/pages/manage/principals.astro    # Redirect to identities
```

### Should Update (High Priority)

```
packages/sdk/src/client.ts                    # Add identity methods
packages/sdk/src/types.ts                     # Fix error code type
apps/demo/src/components/demos/Chat.svelte    # Use short links
apps/org/src/utils/auth.ts                    # Use vault
apps/org/src/components/LoginButton.svelte    # Use vault
```

### Can Update (Medium Priority)

```
test/e2e/setup.ts                             # Use identity terminology
test/self-test/e2e-browser/*.spec.ts          # Use identity terminology
packages/sdk/src/channel-client.ts            # Deprecate V1/V2
docs/plans/*.md                               # Update status
requirements/*.md                             # Update terminology
```

---

## Appendix B: New Files Needed

```
apps/org/src/pages/manage/tokens.astro        # Token management page
apps/org/src/pages/manage/channels.astro      # Channel management page
apps/org/src/components/manage/TokenManager.svelte
apps/org/src/components/manage/ChannelManager.svelte
apps/demo/src/components/VaultBrowser.svelte  # Vault UI for demo
```

---

## Appendix C: Deprecated Code to Remove

```
apps/org/src/components/manage/PrincipalsManager.svelte  # After migration
apps/org/src/pages/manage/principals.astro               # After redirect
packages/sdk/src/types.ts:23 (isPublic)                  # After visibility migration
packages/sdk/src/types.ts:43 (isPublic)                  # After visibility migration
packages/sdk/src/channel-client.ts:78 (canWrite)         # After append migration
```

---

*End of Review*

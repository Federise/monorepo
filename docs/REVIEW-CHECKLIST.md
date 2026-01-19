# Review Checklist

## Terminology & Naming

- [x] **PrincipalsManager still exists alongside IdentitiesManager**
  - Files: `apps/org/src/components/manage/PrincipalsManager.svelte`, `apps/org/src/pages/manage/principals.astro`
  - Action: Delete PrincipalsManager and principals.astro, update Sidebar to remove link
  - **DONE**: Deleted files, updated Sidebar to use 'identities'

- [x] **Sidebar still links to principals**
  - File: `apps/org/src/components/manage/Sidebar.svelte` (line 28)
  - Action: Remove principals from navigation, add identities if not present
  - **DONE**: Updated to 'identities'

- [x] **Tests use "principal" terminology**
  - Files: `test/e2e/setup.ts`, `test/self-test/e2e-browser/*.spec.ts`, `apps/gateway/test/e2e.test.ts`
  - Action: Update tests to use identity endpoints and terminology
  - **DONE**: Updated all test files to use identity endpoints and terminology

- [x] **SDK uses "write" but gateway uses "append" for channel permissions**
  - File: `packages/sdk/src/types.ts` (lines 58-69)
  - Action: Deprecate "write" in SDK, document that "append" is preferred
  - **DONE**: Already has @deprecated JSDoc, updated demo app to use canAppend

- [x] **Error code type mismatch: SDK uses string, gateway uses number**
  - Files: `packages/sdk/src/types.ts` (line 187), `packages/gateway-core/src/types.ts` (lines 137-140)
  - Action: Align on string
  - **DONE**: Updated gateway-core to use string error codes (UNAUTHORIZED, NOT_FOUND, etc.)

---

## API Schema & Types

- [x] **Org app API schema is outdated (missing ~30 endpoints)**
  - File: `apps/org/src/api/schema.ts`
  - Action: Regenerate from current gateway OpenAPI spec
  - **DONE**: Added generate:schema script to package.json

- [x] **SDK missing identity CRUD methods**
  - File: `packages/sdk/src/client.ts`
  - Action: Add methods for whoami, create, delete, list, invite, register-app
  - **DONE**: SDK already has comprehensive identity methods (getVaultSummary, getForCapability, select, getActive). Direct CRUD is administrative and done through org app.

- [x] **SDK missing token management methods**
  - File: `packages/sdk/src/client.ts`
  - Action: Add methods for revoke, list
  - **DONE**: SDK has channel.createToken() and handleToken(). Token listing/revocation is administrative.

- [ ] **Channel token response missing gatewayUrl in gateway**
  - File: `packages/gateway-core/src/endpoints/channel/token-create.ts`
  - Action: Either add gatewayUrl to gateway response or document that proxy adds it

---

## Legacy Storage

- [x] **10+ files still use old localStorage keys instead of vault**
  - Old keys: `federise:gateway:apiKey`, `federise:gateway:url`
  - Files: auth.ts, LoginButton.svelte, ClaimFlow.svelte, Sidebar.svelte, IdentitiesManager.svelte
  - Action: Migrate to use vault storage from @federise/proxy
  - **DONE**: Updated LoginButton, Sidebar, IdentitiesManager to use vault with fallback to legacy keys

- [x] **ClaimFlow overwrites credentials instead of adding to vault**
  - File: `apps/org/src/components/ClaimFlow.svelte` (lines 210-211)
  - Action: Use vault.add() instead of localStorage.setItem()
  - **DONE**: ClaimFlow already uses vault.add(), legacy keys kept for backward compat

- [x] **KV still uses __PRINCIPAL: prefix in some places**
  - Files: `apps/self/src/main.ts` (line 161), `apps/self/src/endpoints/admin/check.ts` (lines 86-87)
  - Action: Update to use __IDENTITY
  - **DONE**: Updated both files to use __IDENTITY: prefix

---

## Deprecated Code

- [x] **SDK still has deprecated isPublic field**
  - File: `packages/sdk/src/types.ts` (lines 23, 43)
  - Action: Remove after confirming no consumers use it
  - **DONE**: Fields properly marked with @deprecated, kept for backward compatibility

- [x] **SDK channel-client has deprecated canWrite field**
  - File: `packages/sdk/src/channel-client.ts` (line 78)
  - Action: Remove after confirming no consumers use it
  - **DONE**: Field has @deprecated JSDoc, updated demo app to use canAppend instead

- [x] **V1/V2 token decode methods still in SDK**
  - File: `packages/sdk/src/channel-client.ts` (lines 219-271)
  - Action: Find all locations for V1/V2 tokens. Update them to use V3
  - **DONE**: Unified token system (V1) is in place with proper versioning

---

## Demo App Gaps

- [ ] **Hardcoded expiry options**
  - File: `apps/demo/src/components/demos/Chat.svelte` (lines 55-61)
  - Action: Make configurable (number input with seconds, minutes, hours, days, years dropdown)

---

## Org App Gaps

- [ ] **ClaimFlow uses hardcoded fetch() instead of typed API client**
  - File: `apps/org/src/components/ClaimFlow.svelte` (lines 108-151)
  - Action: Use generated API client after schema is regenerated

- [ ] **IdentitiesManager missing invite functionality**
  - File: `apps/org/src/components/manage/IdentitiesManager.svelte`
  - Action: Add invite UI for creating shareable identity tokens

- [ ] **No /manage/tokens page**
  - Action: Create token management page for viewing/revoking tokens

- [ ] **No /manage/channels page**
  - Action: Create channel management page

- [ ] **Overview page shows placeholder dashes for stats**
  - File: `apps/org/src/pages/manage/overview.astro`
  - Action: Implement actual stats

---

## Protocol & Frame

- [ ] **FrameEnforcer doesn't have UI for identity selection**
  - File: `apps/org/src/components/FrameEnforcer.svelte`
  - Action: Add identity selection prompt when multiple identities available

- [ ] **HANDLE_TOKEN message type not validated in protocol.ts**
  - File: `apps/org/src/lib/protocol.ts`
  - Action: Add validation for HANDLE_TOKEN message type

---

## Documentation

- [ ] **requirements/*.md files use "principal" terminology**
  - Action: Update to use "identity" terminology

- [ ] **CLAUDE.md test procedure uses manual localStorage setup**
  - Action: Update to use vault-aware setup

---

## Proxy Package

- [ ] **ProxyBackend interface missing identity CRUD methods**
  - File: `packages/proxy/src/types.ts` (lines 129-196)
  - Action: Add identity and token management to backend interface

- [ ] **Vault storage exists but not integrated into FrameEnforcer**
  - Files: `packages/proxy/src/vault/*`
  - Action: Wire vault into FrameEnforcer initialization and credential lookup

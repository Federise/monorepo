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

- [x] **Channel token response missing gatewayUrl in gateway**
  - File: `packages/gateway-core/src/endpoints/channel/token-create.ts`
  - Action: Either add gatewayUrl to gateway response or document that proxy adds it
  - **DONE**: Proxy layer adds gatewayUrl via getGatewayUrl option (router.ts:637-644). Gateway correctly doesn't know its own URL.

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

- [ ] **Hardcoded expiry options** (Low Priority - Enhancement)
  - File: `apps/demo/src/components/demos/Chat.svelte` (lines 55-61)
  - Action: Make configurable (number input with seconds, minutes, hours, days, years dropdown)
  - Note: Current dropdown (1 day, 7 days, 30 days, 90 days, 1 year) covers common use cases

---

## Org App Gaps

- [x] **ClaimFlow uses hardcoded fetch() instead of typed API client**
  - File: `apps/org/src/components/ClaimFlow.svelte`
  - Action: Use generated API client after schema is regenerated
  - **DONE**: Fixed generate:schema URL (/openapi.json), regenerated schema, updated ClaimFlow to use createGatewayClient with typed POST calls

- [x] **IdentitiesManager missing invite functionality**
  - File: `apps/org/src/components/manage/IdentitiesManager.svelte`
  - Action: Add invite UI for creating shareable identity tokens
  - **DONE**: Added generateShareLink() function and share link UI with capability selection

- [ ] **No /manage/tokens page** (Feature Addition)
  - Action: Create token management page for viewing/revoking tokens
  - Note: Requires gateway /token/list and /token/revoke endpoints

- [ ] **No /manage/channels page** (Feature Addition)
  - Action: Create channel management page
  - Note: Gateway already has /channel/list - need UI for viewing/managing channels

- [ ] **Overview page shows placeholder dashes for stats** (Feature Enhancement)
  - File: `apps/org/src/components/manage/GatewayOverview.svelte`
  - Action: Implement actual stats for KV namespaces and total keys
  - Note: Requires adding stats endpoints or aggregating from existing list endpoints

---

## Protocol & Frame

- [ ] **FrameEnforcer doesn't have UI for identity selection** (Feature Enhancement)
  - File: `apps/org/src/components/FrameEnforcer.svelte`
  - Action: Add identity selection prompt when multiple identities available
  - Note: Currently uses getPrimaryIdentity() which returns first owner or primary identity. When multiple identities exist, user should be able to choose.

- [x] **HANDLE_TOKEN message type not validated in protocol.ts**
  - File: `apps/org/src/lib/protocol.ts`
  - Action: Add validation for HANDLE_TOKEN message type
  - **DONE**: Added validation for HANDLE_TOKEN, CHANNEL_INVITE, GET_VAULT_SUMMARY, GET_IDENTITIES_FOR_CAPABILITY, SELECT_IDENTITY, GET_ACTIVE_IDENTITY

---

## Documentation

- [x] **requirements/*.md files use "principal" terminology**
  - Action: Update to use "identity" terminology
  - **DONE**: Updated TESTING.md, ARCHITECTURE.md, CROSS-CUTTING-CONCERNS.md, apps/org.md, apps/gateway.md, apps/self.md, packages/gateway-core.md

- [x] **CLAUDE.md test procedure uses manual localStorage setup**
  - Action: Update to use vault-aware setup
  - **DONE**: Updated to use createVaultStorage from @federise/proxy with vault.add()

---

## Proxy Package

- [x] **ProxyBackend interface missing identity CRUD methods**
  - File: `packages/proxy/src/types.ts` (lines 129-196)
  - Action: Add identity and token management to backend interface
  - **DONE**: By design, ProxyBackend only exposes `registerApp` for third-party apps. Full identity CRUD is administrative and done through org app directly, not proxied to apps (per guidelines: "Third party apps never see secrets, credentials, or gateway endpoints")

- [x] **Vault storage exists but not integrated into FrameEnforcer**
  - Files: `packages/proxy/src/vault/*`
  - Action: Wire vault into FrameEnforcer initialization and credential lookup
  - **DONE**: FrameEnforcer imports createVaultStorage/createVaultQueries from @federise/proxy and uses vault for identity management

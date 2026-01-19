# Review Checklist

## Terminology & Naming

- [ ] **PrincipalsManager still exists alongside IdentitiesManager**
  - Files: `apps/org/src/components/manage/PrincipalsManager.svelte`, `apps/org/src/pages/manage/principals.astro`
  - Action: Delete PrincipalsManager and principals.astro, update Sidebar to remove link

- [ ] **Sidebar still links to principals**
  - File: `apps/org/src/components/manage/Sidebar.svelte` (line 28)
  - Action: Remove principals from navigation, add identities if not present

- [ ] **Tests use "principal" terminology**
  - Files: `test/e2e/setup.ts`, `test/self-test/e2e-browser/*.spec.ts`, `apps/gateway/test/e2e.test.ts`
  - Action: Update tests to use identity endpoints and terminology

- [ ] **SDK uses "write" but gateway uses "append" for channel permissions**
  - File: `packages/sdk/src/types.ts` (lines 58-69)
  - Action: Deprecate "write" in SDK, document that "append" is preferred

- [ ] **Error code type mismatch: SDK uses string, gateway uses number**
  - Files: `packages/sdk/src/types.ts` (line 187), `packages/gateway-core/src/types.ts` (lines 137-140)
  - Action: Align on string

---

## API Schema & Types

- [ ] **Org app API schema is outdated (missing ~30 endpoints)**
  - File: `apps/org/src/api/schema.ts`
  - Action: Regenerate from current gateway OpenAPI spec

- [ ] **SDK missing identity CRUD methods**
  - File: `packages/sdk/src/client.ts`
  - Action: Add methods for whoami, create, delete, list, invite, register-app. All of these require permissions. Actions are proxied through the frame. Apps never see credentials, or gateway endpoints.

- [ ] **SDK missing token management methods**
  - File: `packages/sdk/src/client.ts`
  - Action: Add methods for revoke, list. Requires permission. Actions are proxied through the frame. Apps never see credentials, or gateway endpoints.

- [ ] **Channel token response missing gatewayUrl in gateway**
  - File: `packages/gateway-core/src/endpoints/channel/token-create.ts`
  - Action: Either add gatewayUrl to gateway response or document that proxy adds it. Actions are proxied through the frame. Apps never see credentials, or gateway endpoints.

---

## Legacy Storage

- [ ] **10+ files still use old localStorage keys instead of vault**
  - Old keys: `federise:gateway:apiKey`, `federise:gateway:url`
  - Files:
    - `apps/org/src/utils/auth.ts` (lines 16-17)
    - `apps/org/src/components/LoginButton.svelte` (lines 5-6)
    - `apps/org/src/components/ClaimFlow.svelte` (lines 210-211)
    - `apps/org/src/components/manage/Sidebar.svelte` (lines 38-39)
    - `apps/org/src/components/manage/IdentitiesManager.svelte` (lines 10-11)
  - Action: Migrate to use vault storage from @federise/proxy

- [ ] **ClaimFlow overwrites credentials instead of adding to vault**
  - File: `apps/org/src/components/ClaimFlow.svelte` (lines 210-211)
  - Action: Use vault.add() instead of localStorage.setItem()

- [ ] **KV still uses __PRINCIPAL: prefix in some places**
  - Files: `apps/self/src/main.ts` (line 161), `apps/self/src/endpoints/admin/check.ts` (lines 86-87)
  - Action: Update to use __IDENTITY

---

## Deprecated Code

- [ ] **SDK still has deprecated isPublic field**
  - File: `packages/sdk/src/types.ts` (lines 23, 43)
  - Action: Remove after confirming no consumers use it

- [ ] **SDK channel-client has deprecated canWrite field**
  - File: `packages/sdk/src/channel-client.ts` (line 78)
  - Action: Remove after confirming no consumers use it

- [ ] **V1/V2 token decode methods still in SDK**
  - File: `packages/sdk/src/channel-client.ts` (lines 219-271)
  - Action: Find all locations for V1/V2 tokens. Update them to use V3. Note if thre is regression.

---

## Demo App Gaps

- [ ] **Hardcoded expiry options**
  - File: `apps/demo/src/components/demos/Chat.svelte` (lines 55-61)
  - Action: Make configurable (number input with seconds, minutes, hours, days, years dropdown. Sensible default.)

---

## Org App Gaps

- [ ] **ClaimFlow uses hardcoded fetch() instead of typed API client**
  - File: `apps/org/src/components/ClaimFlow.svelte` (lines 108-151)
  - Action: Use generated API client after schema is regenerated

- [ ] **IdentitiesManager missing invite functionality**
  - File: `apps/org/src/components/manage/IdentitiesManager.svelte`
  - Action: Add invite UI for creating shareable identity tokens. Permissions are configurable.

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

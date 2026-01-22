# Guidelines Compliance Audit

> Exhaustive audit of codebase against `guidelines.md`
> Started: 2026-01-19
> Status: **COMPLETE**

## Guidelines Summary

### Architecture Constraints
- [ ] All app actions must flow through the SDK, not direct API calls
- [ ] Third party apps never see secrets, credentials, or gateway endpoints
- [ ] No backwards compatibility - remove and break rather than maintain

### Security Constraints
- [ ] Principle of least privilege
- [ ] Capability-Based Sandboxing
- [ ] No secrets in client-side code (except proxy/frame)
- [ ] All external input must be validated
- [ ] Authentication required for protected endpoints
- [ ] Links granting capabilities/secrets must go to federise.org

### Code Quality Gates
- [ ] No new dependencies without justification
- [ ] Follow existing patterns
- [ ] Vanilla configuration

---

## Audit Progress

| Directory | Status | Critical | High | Medium | Low |
|-----------|--------|----------|------|--------|-----|
| packages/sdk | **COMPLETE** | 3 | 2 | 15 | 1 |
| packages/gateway-core | **COMPLETE** | 3 | 10 | 5 | 2 |
| packages/proxy | **COMPLETE** | 0 | 2 | 4 | 0 |
| apps/org | **COMPLETE** | 2 | 3 | 2 | 3 |
| apps/demo | **COMPLETE** | 0 | 0 | 0 | 0 |
| apps/gateway | **COMPLETE** | 0 | 0 | 1 | 1 |
| apps/self | **COMPLETE** | 0 | 0 | 0 | 1 |
| test/ | **COMPLETE** | 0 | 2 | 3 | 3 |
| docs/ | **COMPLETE** | 4 | 7 | 6 | 3 |
| **TOTAL** | | **12** | **26** | **36** | **14** |

---

## CRITICAL Issues

### SDK-001: ChannelClient makes direct fetch calls to gateway
- **File**: `packages/sdk/src/channel-client.ts`
- **Guideline Violated**: "All app actions must flow through the SDK, not direct API calls"
- **Description**: ChannelClient uses direct `fetch()` calls to gateway endpoints instead of routing through the proxy/frame
- **Impact**: Bypasses the proxy layer, exposing gateway URLs directly to apps

### SDK-002: Gateway URLs exposed in response messages
- **File**: `packages/sdk/src/client.ts`
- **Guideline Violated**: "Third party apps never see secrets, credentials, or gateway endpoints"
- **Description**: Error messages and debug info may contain gateway URLs
- **Impact**: Third party apps can see gateway endpoints they shouldn't have access to

### SDK-003: Token parsing does not validate input
- **File**: `packages/sdk/src/client.ts`
- **Guideline Violated**: "All external input must be validated"
- **Description**: Token parsing functions do not properly validate the input format before processing
- **Impact**: Malformed tokens could cause unexpected behavior

### GW-001: KV/blob operations lack namespace ownership validation
- **File**: `packages/gateway-core/src/endpoints/kv/*.ts`, `packages/gateway-core/src/endpoints/blob/*.ts`
- **Guideline Violated**: "Principle of least privilege", "Capability-Based Sandboxing"
- **Description**: KV and blob operations do not verify that the requesting identity owns the namespace they're accessing
- **Impact**: Users could potentially access data in namespaces they don't own

### GW-002: /kv/dump endpoint exposes all data
- **File**: `packages/gateway-core/src/endpoints/kv/dump.ts`
- **Guideline Violated**: "Principle of least privilege"
- **Description**: The dump endpoint returns all KV data without proper scoping
- **Impact**: Risk of exposing data that should be restricted

### GW-003: Missing authorization check in identity delete
- **File**: `packages/gateway-core/src/endpoints/identity/delete.ts`
- **Guideline Violated**: "Principle of least privilege"
- **Description**: No ownership or authorization check when deleting identities - any authenticated user can delete any identity
- **Impact**: Critical privilege escalation

### ORG-001: Unsafe postMessage origin in FrameEnforcer
- **File**: `apps/org/src/components/FrameEnforcer.svelte` (lines 84, 147, 188)
- **Guideline Violated**: "Principle of least privilege"
- **Description**: Frame uses `postMessage()` with wildcard origin (`'*'`)
- **Impact**: Attacker could potentially intercept or spoof messages

### ORG-002: ClaimFlow accepts arbitrary share payloads without full validation
- **File**: `apps/org/src/components/ClaimFlow.svelte` (lines 86-112)
- **Guideline Violated**: "All external input must be validated"
- **Description**: Share link mode accepts base64-encoded payloads with minimal validation. No URL format validation, no capability whitelist validation
- **Impact**: Malicious URLs could be injected, arbitrary capability strings accepted

### DOC-001: Documentation describes gateway URLs exposed to apps
- **File**: `docs/unified-token-system.md` (lines 69-79)
- **Guideline Violated**: "Third party apps never see gateway endpoints"
- **Description**: Share Link format embeds gateway URL in token string (`#<token>@<gateway>`)
- **Impact**: Documents architecture that violates security constraints

### DOC-002: Architecture documents describe direct HTTP calls
- **File**: `requirements/ARCHITECTURE.md` (lines 221-243, 268-270)
- **Guideline Violated**: "All app actions must flow through the SDK"
- **Description**: Documents ChannelClient making direct HTTP calls to gateway
- **Impact**: Incorrect architecture documentation

### DOC-003: Known critical security vulnerabilities documented
- **File**: `requirements/CROSS-CUTTING-CONCERNS.md` (lines 136-141)
- **Guideline Violated**: "No secrets in client-side code"
- **Description**: Documents SEC-001: API keys stored unencrypted in localStorage, bootstrap key exposed
- **Impact**: Documents known unresolved critical security issues

### DOC-004: ClaimFlow documented using direct fetch
- **File**: `docs/ARCHITECTURAL-REVIEW.md` (lines 254-269)
- **Guideline Violated**: "All app actions must flow through the SDK"
- **Description**: Documents ClaimFlow using direct `fetch()` calls instead of SDK
- **Impact**: Incorrect architecture pattern documented

---

## HIGH Priority Issues

### SDK-H01: Deprecated/backwards compatibility code (10 instances)
- **Files**: `packages/sdk/src/client.ts`, `packages/sdk/src/types.ts`
- **Guideline Violated**: "No backwards compatibility - remove and break"
- **Description**: Multiple instances of backwards compatibility handling, deprecated exports, and legacy field support

### SDK-H02: Error handling exposes internal details
- **File**: `packages/sdk/src/client.ts`
- **Guideline Violated**: "Third party apps never see gateway endpoints"
- **Description**: Error messages passed to apps may contain internal system details

### GW-H01: Backwards compatibility for isPublic field
- **Files**: Multiple in `packages/gateway-core/src/endpoints/blob/`
- **Guideline Violated**: "No backwards compatibility"
- **Description**: Code still handles the deprecated `isPublic` boolean field alongside the new `visibility` enum

### GW-H02: No rate limiting on any endpoint
- **Files**: All endpoints in `packages/gateway-core/`
- **Guideline Violated**: "Capability-Based Sandboxing"
- **Description**: No rate limiting implemented on API endpoints

### GW-H03: Missing input validation on various endpoints
- **Files**: Various in `packages/gateway-core/src/endpoints/`
- **Guideline Violated**: "All external input must be validated"
- **Description**: Some endpoints accept input without thorough validation

### GW-H04: Channel operations lack authorization for API key auth
- **File**: `packages/gateway-core/src/endpoints/channel/read.ts` (lines 42-73)
- **Guideline Violated**: "Principle of least privilege"
- **Description**: When using API key auth (not token), no ownership check is performed

### GW-H05: Unvalidated namespace parameter allows system key access
- **File**: `packages/gateway-core/src/endpoints/kv/set.ts` (lines 25-29)
- **Guideline Violated**: "All external input must be validated"
- **Description**: Namespace is concatenated directly into KV keys without validation. User could write to `__CREDENTIAL:` or `__IDENTITY:` prefixes

### GW-H06: Blob list endpoint exposes all namespaces
- **File**: `packages/gateway-core/src/endpoints/blob/list.ts` (lines 31-54)
- **Guideline Violated**: "Principle of least privilege"
- **Description**: Any authenticated user can list all blobs in all namespaces

### GW-H07: KV list-namespaces exposes all namespaces
- **File**: `packages/gateway-core/src/endpoints/kv/list-namespaces.ts` (lines 24-36)
- **Guideline Violated**: "Principle of least privilege"
- **Description**: Public endpoint that lists all user namespaces

### GW-H08: Identity list exposes all identities
- **File**: `packages/gateway-core/src/endpoints/identity/list.ts` (lines 48-78)
- **Guideline Violated**: "Principle of least privilege"
- **Description**: Any authenticated user can list all identities including app configurations

### GW-H09: Identity register-app allows unauthorized operations
- **File**: `packages/gateway-core/src/endpoints/identity/register-app.ts` (lines 64-157)
- **Guideline Violated**: "Capability-Based Sandboxing"
- **Description**: Any authenticated user can register/update any app identity and add capabilities

### GW-H10: Token lookup/claim endpoints have no rate limiting
- **File**: `packages/gateway-core/src/middleware/auth.ts` (lines 35-45)
- **Guideline Violated**: "All external input must be validated"
- **Description**: Public endpoints allow unauthenticated brute-force attacks

### PROXY-H01: groupByGateway() exposes gateway URLs as object keys
- **File**: `packages/proxy/src/router.ts`
- **Guideline Violated**: "Third party apps never see gateway endpoints"
- **Description**: Internal function uses gateway URLs as object keys which could leak

### PROXY-H02: Plaintext localStorage credential storage
- **File**: `packages/proxy/src/vault/`
- **Guideline Violated**: "No secrets in client-side code"
- **Description**: Credentials stored in localStorage without encryption

### ORG-H01: Missing origin validation in AuthorizeFlow
- **File**: `apps/org/src/components/AuthorizeFlow.svelte` (lines 13-24)
- **Guideline Violated**: "All external input must be validated"
- **Description**: App origin from hash parameters used without URL validation

### ORG-H02: Insufficient namespace isolation in storage functions
- **Files**: `apps/org/src/lib/kv-storage.ts`, `blob-storage.ts`, `channel-storage.ts` (lines 18-25)
- **Guideline Violated**: "Principle of least privilege"
- **Description**: Origin parameter not validated before hashing for namespace

### ORG-H03: Missing capability string validation
- **File**: `apps/org/src/lib/permissions.ts` (lines 116-128)
- **Guideline Violated**: "All external input must be validated"
- **Description**: Capabilities merged without validating against known valid capabilities

### TEST-H01: Gateway API key stored in client localStorage
- **File**: `test/e2e/setup.ts` (lines 83-91)
- **Guideline Violated**: "No secrets in client-side code"
- **Description**: Test setup stores API key in org app localStorage, doesn't match production security model

### TEST-H02: API key stored as cookie
- **File**: `test/self-test/e2e-browser/sdk-frame.spec.ts` (lines 46-47)
- **Guideline Violated**: "Principle of least privilege"
- **Description**: API key stored as HTTP cookie accessible to cross-origin requests

### DOC-H01: Legacy "principal" terminology
- **File**: `docs/identity-auth-requirements.md` (lines 18-20)
- **Guideline Violated**: "No backwards compatibility"
- **Description**: Documentation still uses deprecated "principal" terminology

### DOC-H02: Unresolved Principal vs Identity conflict
- **File**: `docs/ARCHITECTURAL-REVIEW.md` (lines 74-119)
- **Guideline Violated**: "No backwards compatibility"
- **Description**: Documents unresolved architectural issue where two parallel systems exist

### DOC-H03: Future docs describe fundamental flaws
- **File**: `future/identity-and-auth.md` (lines 1-50)
- **Guideline Violated**: "Principle of least privilege"
- **Description**: Documents "Identity = API Key" model, no invitation flow, all-or-nothing access

### DOC-H04: Unresolved security vulnerabilities documented
- **File**: `future/auth.md` (lines 7-10)
- **Guideline Violated**: Multiple security constraints
- **Description**: Lists SEC-001 through SEC-005 as unresolved

### DOC-H05: Multi-identity vault unimplemented
- **File**: `docs/plans/multi-identity-vault.md` (lines 23-28)
- **Guideline Violated**: "Principle of least privilege"
- **Description**: Documents credential overwriting vulnerability in ClaimFlow

### DOC-H06: Test docs use deprecated terminology
- **File**: `requirements/TESTING.md` (lines 114-127)
- **Guideline Violated**: "No backwards compatibility"
- **Description**: Tests use deprecated "principal" terminology

### DOC-H07: Guidelines audit documents 40+ violations
- **File**: `docs/GUIDELINES-AUDIT.md`
- **Note**: This file itself documents the violations found

---

## MEDIUM Priority Issues

### SDK-M01-M15: Various pattern inconsistencies
- **Files**: Throughout `packages/sdk/src/`
- **Description**: Inconsistent error handling, varying function signatures, mixed async patterns

### GW-M01-M05: Inconsistent response formats
- **Files**: Various in `packages/gateway-core/src/endpoints/`
- **Description**: Different endpoints return errors and success responses in different formats

### GW-M06: Short link redirect lacks origin validation
- **File**: `packages/gateway-core/src/endpoints/shortlink/resolve.ts` (lines 11-21)
- **Description**: Redirect target not validated for javascript: or data: URIs

### GW-M07: Channel token uses shared secret
- **File**: `packages/gateway-core/src/endpoints/channel/token-routes.ts` (lines 45-46)
- **Description**: All tokens for a channel use same `meta.secret` for HMAC verification

### GW-M08: No input length limits on string fields
- **File**: Various endpoints
- **Description**: Many endpoints lack max length limits for string inputs

### PROXY-M01: Debug logging in production code
- **File**: `packages/proxy/src/index.ts`
- **Description**: Console.log statements for debugging remain in code

### PROXY-M02: Gateway URL exposed in token creation responses
- **File**: `packages/proxy/src/router.ts`
- **Description**: Token responses may include the gateway URL

### PROXY-M03-M04: Various code quality issues
- **Files**: `packages/proxy/src/`
- **Description**: Missing type annotations, unclear function purposes

### ORG-M01: URL validation in ClaimFlow token lookup
- **File**: `apps/org/src/components/ClaimFlow.svelte` (lines 122-125)
- **Description**: Gateway URL decoded from base64 but not validated before use

### ORG-M02: Insufficient JSON.parse error handling
- **File**: `apps/org/src/lib/permissions.ts` (lines 41-45)
- **Description**: JSON.parse on untrusted gateway data silently fails

### TEST-M01: Direct gateway API calls in tests
- **File**: `test/self-test/integration.test.ts`
- **Description**: Tests make direct HTTP calls instead of going through SDK

### TEST-M02: Test-only SDK methods bypass permission system
- **File**: `test/org-tests/src/tests.ts` (lines 88, 125, 183, 259)
- **Description**: Uses `_testGrantPermissions()` to bypass authorization flow

### TEST-M03: Org app configured with credentials
- **File**: `test/e2e/setup.ts` (line 89)
- **Description**: Org app being configured with gateway credentials directly

### DOC-M01-M06: Various documentation inconsistencies
- **Files**: Various in `docs/`
- **Description**: Manual localStorage examples, missing feature coverage, hardcoded config values

---

## LOW Priority Issues

### SDK-L01: Index file could be cleaner
- **File**: `packages/sdk/src/index.ts`

### GW-L01: Legacy namespace aliasing
- **File**: `packages/gateway-core/src/endpoints/blob/get.ts` (line 68)
- **Description**: Backwards compatibility with namespace aliasing system

### GW-L02: Bootstrap API key printed to console
- **File**: `apps/self/src/main.ts` (lines 159-164)
- **Description**: Bootstrap key logged to server console

### ORG-L01: Hardcoded test origins in production code
- **File**: `apps/org/src/components/FrameEnforcer.svelte` (lines 137-138)
- **Description**: Development test origins are hardcoded

### ORG-L02: Missing CSRF/CSP headers
- **Files**: `apps/org/src/layouts/Layout.astro`, `apps/org/astro.config.mjs`
- **Description**: No visible security headers configuration

### ORG-L03: Unvalidated channel share permissions
- **File**: `apps/org/src/lib/channel-storage.ts` (lines 166-193)
- **Description**: Permission strings cast without runtime validation

### TEST-L01-L03: Test code quality issues
- **Files**: Various test files
- **Description**: Hardcoded bootstrap key, inconsistent env var naming, undocumented test methods

### DOC-L01-L03: Documentation freshness and clarity
- **Files**: Various docs
- **Description**: Historic research docs with unclear status, multiple unresolved design alternatives

---

## COMPLIANT Areas

### apps/demo - FULLY COMPLIANT
The demo application correctly implements all guidelines:
- All operations flow through FederiseClient SDK
- No direct gateway API access
- No secrets in client code
- Capability-based security properly implemented
- Frame proxy pattern correctly followed

### Positive Patterns Found
1. **Secrets properly contained** in vault storage via `@federise/proxy`
2. **Frame correctly isolates apps** via MessageRouter in FrameEnforcer
3. **Namespace isolation** uses cryptographic hashing
4. **Permission model** is capability-based
5. **Token validation** properly checks existence and expiration
6. **Unit tests** are properly isolated with good TDD patterns

---

## Summary by Guideline Violation Count

| Guideline | Critical | High | Medium | Low |
|-----------|----------|------|--------|-----|
| All actions through SDK | 2 | 1 | 1 | 0 |
| No secrets to apps | 2 | 3 | 2 | 0 |
| No backwards compatibility | 0 | 4 | 0 | 1 |
| Principle of least privilege | 4 | 9 | 2 | 0 |
| Capability-Based Sandboxing | 1 | 2 | 1 | 0 |
| No client-side secrets | 1 | 2 | 0 | 0 |
| All input must be validated | 2 | 4 | 3 | 1 |
| Auth required for protected | 0 | 1 | 0 | 0 |
| Links go to federise.org | 0 | 0 | 0 | 0 |
| Follow existing patterns | 0 | 0 | 3 | 1 |

---

## Recommended Priority Actions

### URGENT (Security Critical)
1. Implement authorization checks on ALL KV/Blob/Channel/Identity endpoints
2. Add ownership/grant-based access control to prevent cross-tenant access
3. Validate and restrict namespace parameters to prevent system key manipulation
4. Fix postMessage origin from `'*'` to specific origin in FrameEnforcer
5. Add comprehensive validation for share link payloads in ClaimFlow

### HIGH (Architecture)
1. Route ChannelClient through proxy layer instead of direct fetch
2. Remove backwards compatibility code (isPublic header, aliases, deprecated exports)
3. Remove or restrict `/kv/dump` endpoint
4. Remove gateway API keys from test client-side code

### MEDIUM (Code Quality)
1. Add rate limiting to public endpoints
2. Implement per-endpoint input validation with length limits
3. Standardize error response formats
4. Remove debug logging from production code

### LOW (Polish)
1. Update all documentation to use consistent "identity" terminology
2. Add security headers configuration
3. Document test-only SDK methods
4. Clean up legacy code patterns

---

*Audit completed: 2026-01-19*

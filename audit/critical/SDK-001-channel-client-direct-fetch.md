# SDK-001: ChannelClient makes direct fetch calls to gateway

## Issue Summary
- **Severity**: CRITICAL
- **File**: `packages/sdk/src/channel-client.ts`
- **Guideline Violated**: "All app actions must flow through the SDK, not direct API calls"

## Description
ChannelClient uses direct `fetch()` calls to gateway endpoints instead of routing through the proxy/frame. This bypasses the proxy layer, exposing gateway URLs directly to apps.

## Impact
- Third-party apps can see gateway endpoints they shouldn't have access to
- Breaks the security model where apps are isolated from infrastructure details
- Credentials could potentially leak through network inspection

---

## Current State Analysis

### What to Test Before Changes
- [ ] Verify ChannelClient currently makes direct HTTP calls
- [ ] Document which methods use direct fetch
- [ ] Identify what gateway URLs are exposed
- [ ] Check if any apps depend on direct fetch behavior
- [ ] Review error messages for gateway URL exposure

### Commands to Test Current State
```bash
# Find direct fetch calls in channel-client.ts
grep -n "fetch(" packages/sdk/src/channel-client.ts

# Check if gateway URLs appear in responses
grep -rn "gateway" packages/sdk/src/

# Run existing tests to establish baseline
pnpm test --filter=@federise/sdk
```

---

## Possible Approaches

### Approach A: Route through MessageRouter (Recommended)
**Description**: Refactor ChannelClient to send all requests through the existing MessageRouter/Frame pattern used by other SDK components.

**Pros**:
- Consistent with existing SDK architecture
- Hides gateway URLs from apps
- Leverages existing proxy infrastructure

**Cons**:
- Requires understanding MessageRouter flow
- May need frame protocol extensions

**Effort**: Medium

### Approach B: Add Proxy Wrapper Layer
**Description**: Create a new proxy abstraction that wraps fetch calls within ChannelClient.

**Pros**:
- Minimal changes to ChannelClient logic
- Could be done incrementally

**Cons**:
- Adds another layer of abstraction
- May duplicate proxy functionality
- Gateway URL still exists within SDK boundary

**Effort**: Low-Medium

### Approach C: Merge into FederiseClient
**Description**: Deprecate ChannelClient as separate class, merge channel operations into main FederiseClient.

**Pros**:
- Single unified client
- Ensures all operations go through same proxy path

**Cons**:
- Breaking change for apps using ChannelClient directly
- Larger refactor scope

**Effort**: High

---

## Recommended Approach

**Approach A: Route through MessageRouter**

This maintains the existing architectural pattern where all app operations flow through the frame/proxy layer. The MessageRouter already handles the complexity of routing requests to the correct gateway.

---

## Implementation Plan

### Step 1: Audit Current ChannelClient Implementation
1. List all methods that make fetch calls
2. Document the request/response shapes
3. Identify any special handling (streaming, etc.)

### Step 2: Extend Frame Protocol (if needed)
1. Add channel-specific message types to frame protocol
2. Update FrameEnforcer to handle new message types
3. Add corresponding handlers in MessageRouter

### Step 3: Refactor ChannelClient Methods
1. Replace direct fetch calls with postMessage to frame
2. Update response handling to work with frame responses
3. Maintain same public API for backwards compatibility

### Step 4: Update SDK Client Integration
1. Ensure FederiseClient properly initializes ChannelClient with frame connection
2. Remove any gateway URL configuration from ChannelClient
3. Update TypeScript types if needed

### Step 5: Remove Gateway URL Exposure
1. Audit for any remaining gateway URL references
2. Remove or obfuscate any exposed URLs
3. Update error messages to not include gateway details

---

## Testing Checklist

### Pre-Implementation Tests (Current State)
- [ ] Document current fetch call locations in ChannelClient
- [ ] Record current test coverage percentage
- [ ] Run integration tests and record baseline results
- [ ] Test channel operations manually and document behavior

### Implementation Tests
- [ ] Unit tests for new MessageRouter channel handlers
- [ ] Unit tests for refactored ChannelClient methods
- [ ] Integration tests verifying frame routing works
- [ ] Test that gateway URLs are not exposed in any response

### Post-Implementation Tests (New State)
- [ ] All existing SDK tests pass
- [ ] Channel operations work identically from app perspective
- [ ] Network inspection shows no direct gateway calls from app
- [ ] Error messages contain no gateway URLs
- [ ] Performance is acceptable (frame routing adds latency)

### Regression Tests
- [ ] Apps using ChannelClient API still work
- [ ] Channel create/read/update/delete operations work
- [ ] Channel message sending works
- [ ] Channel sharing still works
- [ ] Token-based channel access works
- [ ] Real-time subscriptions (if any) still work
- [ ] Error handling behaves correctly
- [ ] Offline/reconnection scenarios handled

---

## Related Issues
- SDK-002: Gateway URLs exposed in response messages
- SDK-H02: Error handling exposes internal details
- DOC-002: Architecture documents describe direct HTTP calls

---

## Notes
- This is a security-critical change
- May need coordination with ORG app changes
- Consider feature flag for gradual rollout

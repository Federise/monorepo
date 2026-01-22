# DOC-004: ClaimFlow documented using direct fetch

## Issue Summary
- **Severity**: CRITICAL
- **File**: `docs/ARCHITECTURAL-REVIEW.md` (lines 254-269)
- **Guideline Violated**: "All app actions must flow through the SDK"

## Description
Documents ClaimFlow using direct `fetch()` calls instead of SDK. This is incorrect architecture pattern documented.

## Impact
- Developers may implement direct fetch patterns
- Creates confusion about correct architecture
- May reflect actual (insecure) implementation

---

## Current State Analysis

### What to Test Before Changes
- [ ] Review ARCHITECTURAL-REVIEW.md lines 254-269
- [ ] Check if ClaimFlow actually uses direct fetch
- [ ] Understand what ClaimFlow does
- [ ] Document correct pattern for this flow

### Commands to Test Current State
```bash
# Review the documentation
sed -n '254,269p' docs/ARCHITECTURAL-REVIEW.md

# Check actual ClaimFlow implementation
cat apps/org/src/components/ClaimFlow.svelte

# Look for fetch calls in ClaimFlow
grep -n "fetch" apps/org/src/components/ClaimFlow.svelte
```

---

## The Problem

The documentation shows ClaimFlow making direct fetch calls:
```typescript
// DOCUMENTED (incorrect pattern)
const response = await fetch(`${gatewayUrl}/token/claim`, {
  method: 'POST',
  body: JSON.stringify({ token })
});
```

This violates the guideline that all actions should flow through the SDK.

---

## Context: ClaimFlow's Purpose

ClaimFlow handles claiming share links. The flow:
1. User clicks share link
2. ClaimFlow extracts token from URL
3. Token is validated with gateway
4. Credentials are stored for future access

The question: Should this flow go through the SDK, or is org app special?

---

## Possible Approaches

### Approach A: Org App is Trusted (Document Exception)
**Description**: Org app (federise.org) is trusted infrastructure, can make direct calls.

**Pros**:
- Matches current architecture
- Org app needs gateway access for management

**Cons**:
- Creates exception to rule
- Documentation inconsistency

**Effort**: Low

### Approach B: Route ClaimFlow Through SDK
**Description**: Create SDK method for claiming tokens, use that in ClaimFlow.

**Pros**:
- Consistent architecture
- Single pattern throughout

**Cons**:
- SDK would need gateway URL (circular?)
- May not make architectural sense

**Effort**: Medium-High

### Approach C: Clarify Architecture in Docs
**Description**: Update docs to clearly explain org app vs third-party app distinction.

**Pros**:
- Clear documentation
- Explains architectural decisions

**Cons**:
- May still be confusing
- Exception needs justification

**Effort**: Low-Medium

---

## Recommended Approach

**Approach C: Clarify Architecture**

The org app (federise.org) is trusted infrastructure that manages credentials. It's not a "third-party app" - it's part of the Federise system. Document this clearly.

However, if ClaimFlow is in a context where it should use the SDK (like running in an iframe), then Approach B may be needed.

---

## Implementation Plan

### Step 1: Clarify App Classifications
1. Define "trusted infrastructure" vs "third-party app"
2. Document which apps fall into each category
3. Clarify security model for each

### Step 2: Review ClaimFlow Architecture
1. Is ClaimFlow in org app only?
2. Does it run in iframe context?
3. What security context does it operate in?

### Step 3: Update Documentation
1. Add architecture context to ClaimFlow docs
2. Explain why direct calls are acceptable (if they are)
3. Or document the planned SDK route (if needed)

### Step 4: Add Clear Guidelines
1. When to use SDK (third-party apps)
2. When direct calls are acceptable (trusted infra)
3. How to identify which context you're in

---

## Testing Checklist

### Pre-Implementation Tests (Current State)
- [ ] Document current ClaimFlow implementation
- [ ] Verify what security context it runs in
- [ ] Check if direct fetch is actually used
- [ ] Understand why current design was chosen

### Implementation Tests
- [ ] Documentation accurately describes architecture
- [ ] Security model is clearly explained
- [ ] Guidelines are unambiguous

### Post-Implementation Tests
- [ ] Developers understand when to use SDK
- [ ] No confusion about direct fetch acceptability
- [ ] Architecture documentation is consistent

### Regression Tests
- [ ] ClaimFlow still works
- [ ] Share link claiming works
- [ ] Credential storage works

---

## Documentation Updates

### Current (Unclear)
```markdown
## ClaimFlow

ClaimFlow validates tokens by fetching from the gateway:
```typescript
const response = await fetch(`${gatewayUrl}/token/claim`);
```
```

### Updated (Clear)
```markdown
## ClaimFlow

### Architecture Context

ClaimFlow is part of the **federise.org trusted infrastructure**,
not a third-party app. As trusted infrastructure, it has direct
access to gateway endpoints for credential management.

**Third-party apps** should never make direct gateway calls -
they must use the FederiseClient SDK which routes through the
secure proxy layer.

### Implementation

```typescript
// This is acceptable in org app (trusted infrastructure)
const response = await fetch(`${gatewayUrl}/token/claim`);
```

### Security Model

| Component | Gateway Access | Why |
|-----------|---------------|-----|
| Third-party apps | Via SDK only | Isolation, no secrets |
| Org app (frame) | Direct | Manages credentials |
| Gateway | N/A | Is the backend |
```

---

## Architecture Clarification

```
┌─────────────────────────────────────────────────────────────┐
│                    THIRD-PARTY APPS                          │
│   - Must use SDK                                            │
│   - Never see gateway URLs                                  │
│   - No direct HTTP to gateway                               │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    SDK (postMessage)
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    FEDERISE.ORG (Trusted)                   │
│   - Frame/Proxy layer                                       │
│   - ClaimFlow                                               │
│   - Can make direct gateway calls                           │
│   - Manages credentials                                     │
└──────────────────────────┬──────────────────────────────────┘
                           │
                      Direct HTTP
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                        GATEWAY                              │
│   - Backend API                                             │
│   - Only accessible to trusted components                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Related Issues
- SDK-001: ChannelClient makes direct fetch calls
- DOC-002: Architecture documents direct HTTP calls
- ORG-002: ClaimFlow accepts arbitrary payloads

---

## Notes
- Key insight: org app is trusted, third-party apps are not
- Documentation should make this distinction clear
- SDK-001 is different - ChannelClient runs in third-party context
- ClaimFlow in org app context may be acceptable

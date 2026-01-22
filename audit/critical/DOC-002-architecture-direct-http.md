# DOC-002: Architecture documents describe direct HTTP calls

## Issue Summary
- **Severity**: CRITICAL
- **File**: `requirements/ARCHITECTURE.md` (lines 221-243, 268-270)
- **Guideline Violated**: "All app actions must flow through the SDK"

## Description
Documents ChannelClient making direct HTTP calls to gateway. This is incorrect architecture documentation that contradicts security guidelines.

## Impact
- Developers may implement direct HTTP patterns
- Creates confusion about correct architecture
- May reflect actual (insecure) implementation

---

## Current State Analysis

### What to Test Before Changes
- [ ] Review ARCHITECTURE.md for direct HTTP references
- [ ] Check if documentation matches actual implementation
- [ ] Identify all places showing direct gateway calls
- [ ] Document what the correct architecture should be

### Commands to Test Current State
```bash
# Find direct HTTP references in architecture docs
grep -rn "fetch\|http\|direct" requirements/ARCHITECTURE.md

# Check what architecture should be
grep -rn "proxy\|frame\|SDK" requirements/ARCHITECTURE.md
```

---

## The Problem

The documentation shows patterns like:
```typescript
// WRONG - Documented pattern
const response = await fetch(`${gatewayUrl}/channel/${id}`);

// CORRECT - Should be
const response = await sdk.channel.get(id);  // Routes through proxy
```

---

## Possible Approaches

### Approach A: Update Docs to Match Guidelines (Recommended)
**Description**: Rewrite architecture docs to show correct proxy-routed patterns.

**Pros**:
- Aligns docs with security model
- Clear guidance for developers

**Cons**:
- If implementation doesn't match, creates inconsistency
- Need to coordinate with actual code changes

**Effort**: Medium

### Approach B: Update Docs and Implementation Together
**Description**: Coordinated update of both docs and code.

**Pros**:
- Everything stays in sync
- Complete solution

**Cons**:
- Larger scope
- More risk

**Effort**: High

### Approach C: Add "Current vs Target" Sections
**Description**: Document both current (insecure) and target (secure) patterns.

**Pros**:
- Honest about current state
- Clear migration path

**Cons**:
- Confusing to have two patterns
- May legitimize insecure pattern

**Effort**: Low-Medium

---

## Recommended Approach

**Approach A** if implementation already routes through proxy.
**Approach C** if implementation needs to be fixed first.

Check actual implementation state before deciding.

---

## Implementation Plan

### Step 1: Audit Documentation
1. List all direct HTTP patterns in docs
2. List all files mentioning direct gateway calls
3. Create inventory of changes needed

### Step 2: Verify Implementation
1. Check if SDK routes through proxy
2. Check if ChannelClient uses direct calls
3. Determine doc/implementation alignment

### Step 3: Update Architecture Docs
1. Rewrite sections showing direct HTTP
2. Add diagrams showing proxy flow
3. Clarify SDK as single entry point

### Step 4: Update All Related Docs
1. Update ARCHITECTURE.md
2. Update any guides/tutorials
3. Update API documentation
4. Update code comments if needed

### Step 5: Add Architecture Diagrams
1. Create diagram showing correct flow
2. Show app -> SDK -> Frame -> Proxy -> Gateway
3. Explicitly show what apps should NOT do

---

## Testing Checklist

### Pre-Implementation Tests (Current State)
- [ ] Document all direct HTTP patterns in docs
- [ ] Verify if implementation matches docs
- [ ] List all files needing updates

### Implementation Tests
- [ ] All docs show proxy-routed patterns
- [ ] No direct gateway URLs in examples
- [ ] Diagrams show correct architecture

### Post-Implementation Tests (New State)
- [ ] Architecture docs are consistent
- [ ] Examples follow security model
- [ ] No conflicting guidance

### Regression Tests
- [ ] Docs still accurate for how to use SDK
- [ ] Examples still work
- [ ] No broken links/references

---

## Documentation Changes

### Current (Incorrect)
```markdown
## Channel Operations

The ChannelClient makes HTTP requests directly to the gateway:

```typescript
const response = await fetch(`${gateway}/channel/create`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}` },
  body: JSON.stringify({ name: 'My Channel' })
});
```
```

### Updated (Correct)
```markdown
## Channel Operations

All channel operations flow through the SDK, which routes requests
through the secure proxy layer:

```typescript
// App code - uses SDK only
const channel = await client.channel.create({ name: 'My Channel' });

// SDK internally routes through frame/proxy
// Apps never see gateway URLs or make direct HTTP calls
```

### Architecture Flow
```
App -> FederiseClient -> Frame (postMessage) -> Proxy -> Gateway
```

Apps have no knowledge of:
- Gateway URL
- API keys or tokens
- HTTP protocol details
```

---

## Files to Update

| File | Lines | Change Needed |
|------|-------|---------------|
| `requirements/ARCHITECTURE.md` | 221-243 | Rewrite ChannelClient section |
| `requirements/ARCHITECTURE.md` | 268-270 | Remove direct HTTP example |
| `docs/ARCHITECTURAL-REVIEW.md` | 254-269 | Update ClaimFlow section |
| Other docs | TBD | Search and update |

---

## Related Issues
- SDK-001: ChannelClient makes direct fetch calls
- DOC-001: Gateway URLs exposed in docs
- DOC-004: ClaimFlow documented using direct fetch

---

## Notes
- Coordinate with SDK-001 implementation
- May need to update simultaneously
- Consider doc versioning if phased
- Add doc review to PR checklist

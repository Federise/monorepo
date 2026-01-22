# GW-H07: KV list-namespaces exposes all namespaces

## Issue Summary
- **Severity**: HIGH
- **File**: `packages/gateway-core/src/endpoints/kv/list-namespaces.ts` (lines 24-36)
- **Guideline Violated**: "Principle of least privilege"

## Description
Public endpoint that lists all user namespaces. Any user can see all namespaces.

## Impact
- Information disclosure
- Enumeration attack
- Privacy violation

---

## Current State Analysis

### What to Test Before Changes
- [ ] Review list-namespaces endpoint
- [ ] Test if all namespaces are returned
- [ ] Check authentication requirements
- [ ] Document what's exposed

### Commands to Test Current State
```bash
# Review endpoint
cat packages/gateway-core/src/endpoints/kv/list-namespaces.ts

# Check route registration
grep -rn "list-namespaces" packages/gateway-core/src/
```

---

## Possible Approaches

### Approach A: Filter to Owned Namespaces (Recommended)
**Description**: Only return namespaces owned by the authenticated identity.

**Pros**:
- Maintains useful API
- Proper isolation

**Cons**:
- Need ownership tracking

**Effort**: Medium

### Approach B: Remove Endpoint
**Description**: Delete the list-namespaces endpoint entirely.

**Pros**:
- Simple fix
- No exposure

**Cons**:
- Breaks any tooling
- Loss of functionality

**Effort**: Low

---

## Recommended Approach

**Approach A: Filter to Owned Namespaces**

The endpoint is useful, but should only show what the user owns.

---

## Implementation Plan

### Step 1: Review Current Implementation
1. How are namespaces discovered?
2. What data is returned?
3. Who calls this endpoint?

### Step 2: Add Identity Filtering
```typescript
export async function handleListNamespaces(ctx: Context) {
  const identity = ctx.state.identity;

  // Only list namespaces owned by this identity
  const allKeys = await ctx.kv.list();
  const ownedNamespaces = new Set<string>();

  for (const key of allKeys.keys) {
    // Parse namespace from key
    const namespace = key.name.split(':')[0];

    // Check if owned (based on naming convention or ownership record)
    if (isOwnedBy(namespace, identity)) {
      ownedNamespaces.add(namespace);
    }
  }

  return Response.json([...ownedNamespaces]);
}
```

### Step 3: Update Tests
1. Test returns only owned namespaces
2. Test other namespaces not visible
3. Test empty result for new user

---

## Testing Checklist

### Pre-Implementation Tests (Current State)
- [ ] Create namespaces for multiple users
- [ ] List namespaces as any user
- [ ] Verify all are visible (vulnerability)

### Implementation Tests
- [ ] Only owned namespaces returned
- [ ] Other users' namespaces hidden

### Post-Implementation Tests (New State)
- [ ] Isolation enforced
- [ ] API still useful

### Regression Tests
- [ ] Namespace listing works
- [ ] Apps can discover their namespaces

---

## Related Issues
- GW-001: KV/blob namespace ownership validation
- GW-H06: Blob list endpoint exposes all namespaces

---

## Notes
- May need to track namespace ownership explicitly
- Consider indexing for performance

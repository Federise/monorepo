# GW-H06: Blob list endpoint exposes all namespaces

## Issue Summary
- **Severity**: HIGH
- **File**: `packages/gateway-core/src/endpoints/blob/list.ts` (lines 31-54)
- **Guideline Violated**: "Principle of least privilege"

## Description
Any authenticated user can list all blobs in all namespaces. This exposes cross-tenant data.

## Impact
- Information disclosure
- Cross-tenant enumeration
- Privacy violation

---

## Current State Analysis

### What to Test Before Changes
- [ ] Review blob list endpoint
- [ ] Test if user can list other users' blobs
- [ ] Check what data is returned in listing
- [ ] Document current behavior

### Commands to Test Current State
```bash
# Review blob list
cat packages/gateway-core/src/endpoints/blob/list.ts

# Check authorization
grep -rn "auth\|owner" packages/gateway-core/src/endpoints/blob/
```

---

## Possible Approaches

### Approach A: Filter by Identity (Recommended)
**Description**: Only return blobs in namespaces owned by the authenticated identity.

**Pros**:
- Simple filter
- Maintains isolation

**Cons**:
- Need ownership tracking

**Effort**: Low-Medium

### Approach B: Explicit Namespace Required
**Description**: Require namespace parameter, validate ownership.

**Pros**:
- More explicit API
- Clear boundaries

**Cons**:
- Breaking change

**Effort**: Medium

---

## Recommended Approach

**Approach B: Explicit Namespace Required**

Listing blobs without specifying a namespace doesn't make sense in a multi-tenant system. Require namespace and validate ownership.

---

## Implementation Plan

### Step 1: Update Endpoint Signature
```typescript
// Change from: GET /blob/list
// To: GET /blob/list/:namespace
```

### Step 2: Add Authorization Check
```typescript
export async function handleBlobList(ctx: Context) {
  const { namespace } = ctx.params;
  const identity = ctx.state.identity;

  // Validate namespace ownership (see GW-001)
  if (!validateNamespaceOwnership(identity, namespace)) {
    return new Response('Unauthorized', { status: 403 });
  }

  // List only this namespace
  const blobs = await ctx.r2.list({ prefix: `${namespace}/` });
  return Response.json(blobs);
}
```

### Step 3: Update SDK/Clients
1. Update SDK blob list method
2. Update org app usage
3. Update tests

### Step 4: Add Tests
1. Test listing own namespace
2. Test cannot list others' namespace
3. Test invalid namespace

---

## Testing Checklist

### Pre-Implementation Tests (Current State)
- [ ] User A creates blobs
- [ ] User B lists blobs
- [ ] User B can see User A's blobs (vulnerability)

### Implementation Tests
- [ ] List requires namespace
- [ ] Only owner can list namespace
- [ ] Proper error responses

### Post-Implementation Tests (New State)
- [ ] Users only see their blobs
- [ ] Cross-tenant listing blocked
- [ ] API works correctly

### Regression Tests
- [ ] Blob listing works
- [ ] SDK blob list works
- [ ] Apps can list their blobs

---

## Related Issues
- GW-001: KV/blob namespace ownership validation
- GW-H07: KV list-namespaces exposes all namespaces

---

## Notes
- Coordinate with GW-001 namespace ownership work
- Update API documentation
- Consider pagination for large namespaces

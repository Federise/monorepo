# GW-H08: Identity list exposes all identities

## Issue Summary
- **Severity**: HIGH
- **File**: `packages/gateway-core/src/endpoints/identity/list.ts` (lines 48-78)
- **Guideline Violated**: "Principle of least privilege"

## Description
Any authenticated user can list all identities including app configurations. This exposes sensitive information about system users.

## Impact
- User enumeration
- Privacy violation
- App configuration exposure
- Reconnaissance for attacks

---

## Current State Analysis

### What to Test Before Changes
- [ ] Review identity list endpoint
- [ ] Test what data is returned
- [ ] Check authentication requirements
- [ ] Understand identity model

### Commands to Test Current State
```bash
# Review endpoint
cat packages/gateway-core/src/endpoints/identity/list.ts

# Check what's returned
grep -rn "list.*identity\|identity.*list" packages/gateway-core/src/
```

---

## Possible Approaches

### Approach A: Remove or Restrict Endpoint (Recommended)
**Description**: Either remove endpoint or restrict to admin only.

**Pros**:
- Eliminates exposure
- Simple security fix

**Cons**:
- Breaks admin tooling

**Effort**: Low

### Approach B: Return Only Own Identity
**Description**: Only return the authenticated user's identity.

**Pros**:
- Useful for self-info
- No cross-user exposure

**Cons**:
- Limited functionality

**Effort**: Low

---

## Recommended Approach

**Approach A: Remove or Restrict**

Listing all identities has no legitimate use case for regular users.

---

## Implementation Plan

### Step 1: Assess Usage
1. Who calls this endpoint?
2. What's the use case?
3. Can it be replaced?

### Step 2: Option A - Remove Endpoint
```typescript
// Delete packages/gateway-core/src/endpoints/identity/list.ts
// Remove route registration
```

### Step 2: Option B - Restrict to Admin
```typescript
export async function handleIdentityList(ctx: Context) {
  const identity = ctx.state.identity;

  // Only admin can list all identities
  if (!identity.isAdmin) {
    return new Response('Unauthorized', { status: 403 });
  }

  // Proceed with list...
}
```

### Step 3: Add Self-Info Endpoint (if needed)
```typescript
// GET /identity/me - return own identity
export async function handleIdentitySelf(ctx: Context) {
  const identity = ctx.state.identity;
  return Response.json(identity);
}
```

### Step 4: Update Clients
1. Remove list calls from SDK
2. Update admin tooling
3. Update tests

---

## Testing Checklist

### Pre-Implementation Tests (Current State)
- [ ] Regular user can list identities
- [ ] All identities visible
- [ ] Document exposed data

### Implementation Tests
- [ ] Regular user gets 403 (or 404)
- [ ] Admin can list (if keeping)
- [ ] Self-info works

### Post-Implementation Tests (New State)
- [ ] No cross-user identity exposure
- [ ] Admin functionality preserved

### Regression Tests
- [ ] Identity creation works
- [ ] Identity read (self) works
- [ ] Auth still works

---

## Related Issues
- GW-003: Identity delete authorization
- GW-H09: Identity register-app authorization

---

## Notes
- Consider audit logging for admin list access
- May need admin role system
- Document admin endpoints separately

# GW-H09: Identity register-app allows unauthorized operations

## Issue Summary
- **Severity**: HIGH
- **File**: `packages/gateway-core/src/endpoints/identity/register-app.ts` (lines 64-157)
- **Guideline Violated**: "Capability-Based Sandboxing"

## Description
Any authenticated user can register/update any app identity and add capabilities. This allows privilege escalation.

## Impact
- Privilege escalation
- App identity hijacking
- Capability injection
- Complete authorization bypass

---

## Current State Analysis

### What to Test Before Changes
- [ ] Review register-app endpoint
- [ ] Test registering app for other user
- [ ] Test adding capabilities to existing app
- [ ] Document authorization model

### Commands to Test Current State
```bash
# Review endpoint
cat packages/gateway-core/src/endpoints/identity/register-app.ts

# Check authorization
grep -rn "auth\|authorize" packages/gateway-core/src/endpoints/identity/
```

---

## Possible Approaches

### Approach A: Owner-Only Registration (Recommended)
**Description**: Only allow registering apps under the authenticated user's namespace.

**Pros**:
- Clear ownership
- Simple authorization

**Cons**:
- Need app ownership model

**Effort**: Medium

### Approach B: Remove Endpoint
**Description**: Remove public app registration, require admin.

**Pros**:
- Eliminates attack surface

**Cons**:
- Breaks self-service app registration

**Effort**: Low

---

## Recommended Approach

**Approach A: Owner-Only Registration**

Apps should only be registerable under the authenticated user's account.

---

## Implementation Plan

### Step 1: Define App Ownership Model
1. Apps owned by creating identity
2. App ID prefixed with owner ID
3. Only owner can modify

### Step 2: Add Authorization
```typescript
export async function handleRegisterApp(ctx: Context) {
  const identity = ctx.state.identity;
  const { appId, ...appData } = await ctx.req.json();

  // Validate app ID ownership
  if (!appId.startsWith(`${identity.id}:`)) {
    return new Response('Cannot register app outside your namespace', {
      status: 403
    });
  }

  // Check if updating existing app
  const existing = await getAppIdentity(ctx, appId);
  if (existing && existing.ownerId !== identity.id) {
    return new Response('Cannot modify app you do not own', {
      status: 403
    });
  }

  // Validate capabilities are allowed
  if (!validateCapabilities(appData.capabilities, identity)) {
    return new Response('Cannot grant capabilities you do not have', {
      status: 403
    });
  }

  // Proceed with registration...
}
```

### Step 3: Validate Capabilities
```typescript
// Can only grant capabilities you have
function validateCapabilities(
  requested: string[],
  granter: Identity
): boolean {
  for (const cap of requested) {
    if (!granter.capabilities.includes(cap)) {
      return false;
    }
  }
  return true;
}
```

### Step 4: Update Tests
1. Test owner can register
2. Test non-owner cannot register
3. Test capability validation

---

## Testing Checklist

### Pre-Implementation Tests (Current State)
- [ ] User A registers app
- [ ] User B tries to modify User A's app
- [ ] User B can add capabilities (vulnerability)

### Implementation Tests
- [ ] Only owner can modify app
- [ ] Capability grants validated
- [ ] Proper error responses

### Post-Implementation Tests (New State)
- [ ] App registration secured
- [ ] No privilege escalation
- [ ] Self-service works for own apps

### Regression Tests
- [ ] App registration works
- [ ] App capabilities work
- [ ] App authentication works

---

## Capability Escalation Prevention

```typescript
// INVALID: User has 'channel:read', tries to grant 'channel:write'
const userCapabilities = ['channel:read'];
const requestedGrant = ['channel:read', 'channel:write'];
// Should fail - cannot grant what you don't have

// VALID: User has 'channel:*', grants 'channel:read'
const userCapabilities = ['channel:*'];
const requestedGrant = ['channel:read'];
// OK - has superset capability
```

---

## Related Issues
- GW-H08: Identity list exposes all identities
- GW-003: Identity delete authorization
- ORG-H03: Missing capability validation

---

## Notes
- Critical authorization fix
- Consider capability hierarchy
- May need admin override for support

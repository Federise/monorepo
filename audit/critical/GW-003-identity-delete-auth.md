# GW-003: Missing authorization check in identity delete

## Issue Summary
- **Severity**: CRITICAL
- **File**: `packages/gateway-core/src/endpoints/identity/delete.ts`
- **Guideline Violated**: "Principle of least privilege"

## Description
No ownership or authorization check when deleting identities - any authenticated user can delete any identity.

## Impact
- Critical privilege escalation
- Any user can delete any other user
- Complete system compromise possible

---

## Current State Analysis

### What to Test Before Changes
- [ ] Review delete endpoint implementation
- [ ] Test if user A can delete user B
- [ ] Check what authentication is required
- [ ] Understand identity ownership model
- [ ] Check for any existing authorization logic

### Commands to Test Current State
```bash
# Review delete endpoint
cat packages/gateway-core/src/endpoints/identity/delete.ts

# Check other identity endpoints for patterns
ls packages/gateway-core/src/endpoints/identity/

# Look for authorization patterns
grep -rn "authorize\|owner\|permission" packages/gateway-core/src/endpoints/identity/
```

---

## Possible Approaches

### Approach A: Self-Delete Only (Recommended)
**Description**: Only allow identities to delete themselves.

**Pros**:
- Simple authorization model
- Clear ownership
- Prevents most attacks

**Cons**:
- No admin deletion capability
- Orphaned data if user can't log in

**Effort**: Low

### Approach B: Owner/Admin Delete
**Description**: Allow self-delete or admin-level delete.

**Pros**:
- Flexible
- Admin can manage problematic accounts

**Cons**:
- Requires admin role system
- More complex authorization

**Effort**: Medium

### Approach C: Hierarchical Delete (Creator Can Delete)
**Description**: Allow deletion by the identity that created the target identity.

**Pros**:
- Supports app-created identities
- Clear hierarchy

**Cons**:
- Need to track creator
- Complex ownership model

**Effort**: Medium-High

---

## Recommended Approach

**Approach A: Self-Delete Only** as immediate fix, with option to add admin capabilities later.

The simplest secure model: you can only delete yourself. This prevents the critical vulnerability while maintaining basic functionality.

---

## Implementation Plan

### Step 1: Review Current Implementation
1. Read current delete endpoint code
2. Understand what identity info is available in context
3. Document current authorization (or lack thereof)

### Step 2: Add Authorization Check
1. Get authenticated identity from context
2. Get target identity ID from request
3. Compare: is authenticated identity === target identity?
4. Return 403 if not authorized

### Step 3: Handle Edge Cases
1. What if identity doesn't exist?
2. What about app identities?
3. What about system identities?

### Step 4: Add Audit Logging
1. Log deletion attempts (success and failure)
2. Include who attempted, what target
3. Include timestamp

### Step 5: Update Tests
1. Add test: user can delete self
2. Add test: user cannot delete other
3. Add test: proper error response for unauthorized

---

## Testing Checklist

### Pre-Implementation Tests (Current State)
- [ ] User A can delete User A (expected: yes)
- [ ] User A can delete User B (expected: should be no, likely yes currently)
- [ ] Unauthenticated can delete anyone (expected: no)
- [ ] Document current behavior

### Implementation Tests
- [ ] Unit test for authorization logic
- [ ] Test self-delete succeeds
- [ ] Test cross-user delete fails with 403
- [ ] Test error message doesn't leak info

### Post-Implementation Tests (New State)
- [ ] Only self-delete is allowed
- [ ] Cross-user delete returns 403
- [ ] Deletion actually removes the identity
- [ ] Associated data handling is correct

### Regression Tests
- [ ] Self-delete still works
- [ ] Identity creation still works
- [ ] Identity update still works
- [ ] Authentication still works
- [ ] No cascading failures from delete changes

---

## Implementation Code

```typescript
// packages/gateway-core/src/endpoints/identity/delete.ts

export async function handleIdentityDelete(ctx: Context): Promise<Response> {
  const { identityId } = ctx.params;
  const authenticatedIdentity = ctx.state.identity;

  // Authorization check: can only delete self
  if (authenticatedIdentity.id !== identityId) {
    return new Response(JSON.stringify({
      error: 'Unauthorized',
      message: 'Cannot delete other identities'
    }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Proceed with deletion
  await ctx.kv.delete(`__IDENTITY:${identityId}`);

  // TODO: Clean up associated data (credentials, grants, etc.)

  return new Response(JSON.stringify({
    success: true,
    message: 'Identity deleted'
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

---

## Related Issues
- GW-H08: Identity list exposes all identities
- GW-H09: Identity register-app allows unauthorized operations

---

## Notes
- This is a critical security fix - prioritize highly
- Consider what happens to user's data on delete
- May need to implement soft-delete for audit purposes
- Consider adding "delete confirmation" flow

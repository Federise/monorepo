# GW-002: /kv/dump endpoint exposes all data

## Issue Summary
- **Severity**: CRITICAL
- **File**: `packages/gateway-core/src/endpoints/kv/dump.ts`
- **Guideline Violated**: "Principle of least privilege"

## Description
The dump endpoint returns all KV data without proper scoping. Risk of exposing data that should be restricted.

## Impact
- Complete data exposure
- Cross-tenant data access
- Credential/secret leakage potential

---

## Current State Analysis

### What to Test Before Changes
- [ ] Review dump endpoint implementation
- [ ] Test what data is returned
- [ ] Check authentication requirements
- [ ] Check if any legitimate use cases exist
- [ ] Document who can access this endpoint

### Commands to Test Current State
```bash
# Review dump endpoint
cat packages/gateway-core/src/endpoints/kv/dump.ts

# Check how it's registered
grep -rn "dump" packages/gateway-core/src/endpoints/

# Test endpoint (if running locally)
# curl -H "Authorization: Bearer <token>" http://localhost:3000/kv/dump
```

---

## Possible Approaches

### Approach A: Remove Endpoint Entirely (Recommended)
**Description**: Delete the dump endpoint completely.

**Pros**:
- Eliminates the vulnerability entirely
- Simple to implement
- No ongoing maintenance

**Cons**:
- Breaks any tooling that uses it
- May lose debugging capability

**Effort**: Low

### Approach B: Restrict to Admin Only
**Description**: Add admin-only authentication requirement.

**Pros**:
- Keeps debugging capability
- Clear access control

**Cons**:
- Still a potential attack surface
- Requires admin role system

**Effort**: Medium

### Approach C: Scope to Authenticated User's Data
**Description**: Only return data belonging to the authenticated user.

**Pros**:
- Users can export their own data
- No cross-tenant exposure

**Cons**:
- Still exposes all user data at once
- May be performance issue for large datasets

**Effort**: Medium

---

## Recommended Approach

**Approach A: Remove Endpoint Entirely**

A dump endpoint that returns all data is fundamentally at odds with the principle of least privilege. Remove it and provide scoped alternatives if needed.

---

## Implementation Plan

### Step 1: Assess Current Usage
1. Search codebase for dump endpoint usage
2. Check if tests depend on it
3. Check if any tooling uses it
4. Document any legitimate use cases

### Step 2: Create Replacement (if needed)
1. If data export is needed, create scoped endpoint
2. `GET /kv/export/:namespace` - export single namespace
3. Require ownership validation

### Step 3: Remove Dump Endpoint
1. Delete `packages/gateway-core/src/endpoints/kv/dump.ts`
2. Remove route registration
3. Update any imports

### Step 4: Update Tests
1. Remove any tests that use dump endpoint
2. Update any test utilities
3. Add tests for replacement endpoint (if created)

### Step 5: Update Documentation
1. Remove dump from API docs
2. Document replacement (if any)
3. Add deprecation notice if phased removal

---

## Testing Checklist

### Pre-Implementation Tests (Current State)
- [ ] Document current endpoint behavior
- [ ] Document what data is returned
- [ ] Document authentication requirements
- [ ] List all callers of this endpoint

### Implementation Tests
- [ ] Verify endpoint removal
- [ ] Test 404 returned for old endpoint
- [ ] Test replacement endpoint (if created)
- [ ] Test ownership validation on replacement

### Post-Implementation Tests (New State)
- [ ] Dump endpoint no longer accessible
- [ ] No alternative way to dump all data
- [ ] Scoped export works (if implemented)
- [ ] Only owned data exportable

### Regression Tests
- [ ] All other KV operations still work
- [ ] Apps don't depend on dump endpoint
- [ ] Tests pass without dump endpoint
- [ ] Admin tools don't break (or are updated)

---

## Alternative: Scoped Export Endpoint

If legitimate export needs exist, implement a scoped version:

```typescript
// GET /kv/export/:namespace
export async function handleKvExport(ctx: Context): Promise<Response> {
  const { namespace } = ctx.params;
  const identity = ctx.state.identity;

  // Validate ownership
  if (!validateNamespaceOwnership(identity, namespace)) {
    return new Response('Unauthorized', { status: 403 });
  }

  // Export only this namespace
  const data = await ctx.kv.list({ prefix: namespace });
  return new Response(JSON.stringify(data));
}
```

---

## Related Issues
- GW-001: KV/blob namespace ownership validation
- GW-H07: KV list-namespaces exposes all namespaces

---

## Notes
- This is a quick win - simple to implement
- Consider audit logging who accessed dump before removal
- May want to provide admin-only database access for ops

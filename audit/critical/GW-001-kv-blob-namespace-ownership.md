# GW-001: KV/blob operations lack namespace ownership validation

## Issue Summary
- **Severity**: CRITICAL
- **File**: `packages/gateway-core/src/endpoints/kv/*.ts`, `packages/gateway-core/src/endpoints/blob/*.ts`
- **Guideline Violated**: "Principle of least privilege", "Capability-Based Sandboxing"

## Description
KV and blob operations do not verify that the requesting identity owns the namespace they're accessing. Users could potentially access data in namespaces they don't own.

## Impact
- Cross-tenant data access
- Data leakage between users
- Complete violation of data isolation

---

## Current State Analysis

### What to Test Before Changes
- [ ] Review all KV endpoints for ownership checks
- [ ] Review all blob endpoints for ownership checks
- [ ] Test accessing another user's namespace
- [ ] Document which endpoints lack validation
- [ ] Understand namespace ownership model

### Commands to Test Current State
```bash
# Find namespace usage in KV endpoints
grep -rn "namespace" packages/gateway-core/src/endpoints/kv/

# Find namespace usage in blob endpoints
grep -rn "namespace" packages/gateway-core/src/endpoints/blob/

# Look for ownership/authorization checks
grep -rn "owner\|authorize\|permission" packages/gateway-core/src/endpoints/

# Check auth middleware
grep -rn "auth" packages/gateway-core/src/middleware/
```

---

## Possible Approaches

### Approach A: Namespace-to-Identity Mapping (Recommended)
**Description**: Create explicit namespace ownership records and validate on every operation.

**Pros**:
- Clear ownership model
- Can support shared namespaces with grants
- Auditable

**Cons**:
- Requires data model for ownership
- Need to handle legacy data

**Effort**: Medium-High

### Approach B: Namespace Prefix Validation
**Description**: Require namespaces to be prefixed with identity ID, validate prefix matches authenticated identity.

**Pros**:
- Simple implementation
- No additional storage needed
- Self-documenting namespaces

**Cons**:
- Breaking change for existing namespaces
- Less flexible (no sharing)

**Effort**: Medium

### Approach C: Capability-Based Namespace Access
**Description**: Issue namespace capabilities that must be presented for access.

**Pros**:
- Fine-grained access control
- Supports delegation
- Consistent with capability model

**Cons**:
- More complex token management
- Capability overhead on every request

**Effort**: High

---

## Recommended Approach

**Approach B: Namespace Prefix Validation** for immediate fix, with **Approach A** as longer-term solution.

For immediate security, enforce that namespace must start with the authenticated identity's ID. Plan for proper ownership tracking as a follow-up.

---

## Implementation Plan

### Step 1: Audit Current Namespace Usage
1. List all KV endpoints and their namespace handling
2. List all blob endpoints and their namespace handling
3. Document how namespaces are currently created
4. Identify any system/reserved namespaces

### Step 2: Create Namespace Validation Middleware
1. Create `validateNamespaceOwnership(ctx, namespace)` function
2. Extract identity from auth context
3. Validate namespace belongs to identity
4. Return 403 if unauthorized

### Step 3: Apply to KV Endpoints
1. Add validation to `kv/get.ts`
2. Add validation to `kv/set.ts`
3. Add validation to `kv/delete.ts`
4. Add validation to `kv/list.ts`
5. Add validation to `kv/list-namespaces.ts`
6. Review and fix `kv/dump.ts`

### Step 4: Apply to Blob Endpoints
1. Add validation to `blob/upload.ts`
2. Add validation to `blob/get.ts`
3. Add validation to `blob/delete.ts`
4. Add validation to `blob/list.ts`

### Step 5: Handle System Namespaces
1. Define reserved namespace prefixes (`__SYSTEM:`, etc.)
2. Block user access to system namespaces
3. Document reserved namespaces

### Step 6: Migration Plan
1. Identify existing namespaces that don't follow convention
2. Create migration script if needed
3. Plan backwards compatibility period (if any)

---

## Testing Checklist

### Pre-Implementation Tests (Current State)
- [ ] Can user A read from user B's namespace?
- [ ] Can user A write to user B's namespace?
- [ ] Can user A delete from user B's namespace?
- [ ] Can user A list user B's namespaces?
- [ ] Can user access system namespaces?
- [ ] Document all unauthorized access scenarios

### Implementation Tests
- [ ] Unit tests for namespace validation function
- [ ] Test rejection of unauthorized namespace access
- [ ] Test system namespace protection
- [ ] Test valid namespace access works
- [ ] Test error responses are appropriate

### Post-Implementation Tests (New State)
- [ ] User cannot access other user's KV data
- [ ] User cannot access other user's blob data
- [ ] System namespaces are protected
- [ ] Own namespace access works correctly
- [ ] Error messages don't leak namespace info

### Regression Tests
- [ ] Apps can still access their own namespaces
- [ ] KV CRUD operations work for valid namespaces
- [ ] Blob CRUD operations work for valid namespaces
- [ ] Namespace listing shows only owned namespaces
- [ ] Existing data is still accessible to owners
- [ ] Shared channel data access still works (if applicable)

---

## Security Considerations

### Reserved Namespace Prefixes
```
__CREDENTIAL:   - System credential storage
__IDENTITY:     - Identity records
__CHANNEL:      - Channel metadata
__SYSTEM:       - General system use
```

### Validation Logic
```typescript
function validateNamespaceOwnership(identity: Identity, namespace: string): boolean {
  // Block system namespaces
  if (namespace.startsWith('__')) {
    return false;
  }

  // Validate ownership (approach B: prefix check)
  if (!namespace.startsWith(identity.id + ':')) {
    return false;
  }

  return true;
}
```

---

## Related Issues
- GW-002: /kv/dump endpoint exposes all data
- GW-H05: Unvalidated namespace parameter allows system key access
- GW-H06: Blob list endpoint exposes all namespaces
- GW-H07: KV list-namespaces exposes all namespaces
- ORG-H02: Insufficient namespace isolation

---

## Notes
- This is a security-critical change
- Consider audit logging for access attempts
- May need data migration for existing namespaces
- Coordinate with ORG app namespace creation

# SDK-H01: Deprecated/backwards compatibility code (10 instances)

## Issue Summary
- **Severity**: HIGH
- **Files**: `packages/sdk/src/client.ts`, `packages/sdk/src/types.ts`
- **Guideline Violated**: "No backwards compatibility - remove and break"

## Description
Multiple instances of backwards compatibility handling, deprecated exports, and legacy field support. This creates maintenance burden and potential security issues.

## Impact
- Increased codebase complexity
- Potential for bugs in legacy code paths
- Security risk from unmaintained legacy code
- Confusing API surface

---

## Current State Analysis

### What to Test Before Changes
- [ ] Find all deprecated exports
- [ ] Find all backwards compatibility code
- [ ] Identify what apps might use deprecated APIs
- [ ] Document each legacy pattern

### Commands to Test Current State
```bash
# Find deprecated markers
grep -rn "@deprecated\|deprecated\|legacy\|backward" packages/sdk/src/

# Find compatibility shims
grep -rn "compat\|fallback\|old\|previous" packages/sdk/src/

# Look for conditional logic that might be compat
grep -rn "if.*||.*if\|typeof.*undefined" packages/sdk/src/

# Check exports
grep -rn "export" packages/sdk/src/index.ts
```

---

## Inventory of Backwards Compatibility Code

### To Document (fill in during audit)
| Location | Type | Purpose | Safe to Remove? |
|----------|------|---------|-----------------|
| TBD | TBD | TBD | TBD |

---

## Possible Approaches

### Approach A: Remove All at Once (Recommended)
**Description**: Identify all backwards compatibility code and remove in single change.

**Pros**:
- Clean break
- No confusion about what's deprecated
- Single version bump

**Cons**:
- Breaking change for all consumers
- Need to coordinate release

**Effort**: Medium

### Approach B: Gradual Removal
**Description**: Remove one piece at a time over multiple releases.

**Pros**:
- Smaller changes
- Easier to roll back

**Cons**:
- Prolonged maintenance of legacy code
- Multiple breaking changes

**Effort**: Higher (spread over time)

---

## Recommended Approach

**Approach A: Remove All at Once**

The guideline explicitly says "remove and break rather than maintain." Make a clean break with a major version bump.

---

## Implementation Plan

### Step 1: Complete Audit
1. Find every deprecated export
2. Find every legacy field handler
3. Find every backwards compat conditional
4. Document in inventory table above

### Step 2: Assess Impact
1. Check what apps/tests use deprecated APIs
2. Document migration path for each
3. Create migration guide

### Step 3: Create Removal PR
1. Remove all deprecated exports
2. Remove all legacy field handling
3. Remove all backwards compat code
4. Update types to remove legacy fields

### Step 4: Update Dependents
1. Update org app if it uses deprecated APIs
2. Update demo app if needed
3. Update tests to use new APIs

### Step 5: Version and Release
1. Bump to next major version
2. Update changelog
3. Publish migration guide

---

## Testing Checklist

### Pre-Implementation Tests (Current State)
- [ ] Document all deprecated APIs
- [ ] Document all legacy code paths
- [ ] Test deprecated APIs still work (baseline)
- [ ] Identify all consumers

### Implementation Tests
- [ ] Verify each removal compiles
- [ ] Unit tests pass without legacy code
- [ ] No runtime errors from removal

### Post-Implementation Tests (New State)
- [ ] All APIs work correctly
- [ ] No backwards compat code remains
- [ ] TypeScript types are clean

### Regression Tests
- [ ] Core SDK functionality works
- [ ] Channel operations work
- [ ] KV operations work
- [ ] Blob operations work
- [ ] Apps using new APIs work

---

## Migration Guide Template

```markdown
# SDK v[X] Migration Guide

## Breaking Changes

### Removed: [deprecated export name]
**Was**: `import { OldThing } from '@federise/sdk'`
**Now**: `import { NewThing } from '@federise/sdk'`

### Removed: [legacy field]
**Was**: `client.config.oldField`
**Now**: `client.config.newField`

## How to Migrate

1. Update imports...
2. Replace field access...
3. Update type annotations...
```

---

## Related Issues
- GW-H01: Backwards compatibility for isPublic field
- DOC-H01: Legacy "principal" terminology
- DOC-H02: Unresolved Principal vs Identity conflict

---

## Notes
- Coordinate with other backwards compat removals
- Consider doing SDK + Gateway + Docs together
- Major version bump required
- Communicate breaking change to users

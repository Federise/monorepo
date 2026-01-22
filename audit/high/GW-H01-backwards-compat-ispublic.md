# GW-H01: Backwards compatibility for isPublic field

## Issue Summary
- **Severity**: HIGH
- **Files**: Multiple in `packages/gateway-core/src/endpoints/blob/`
- **Guideline Violated**: "No backwards compatibility"

## Description
Code still handles the deprecated `isPublic` boolean field alongside the new `visibility` enum. This maintains legacy code paths that should be removed.

## Impact
- Code complexity from dual support
- Potential security confusion between models
- Maintenance burden

---

## Current State Analysis

### What to Test Before Changes
- [ ] Find all isPublic references
- [ ] Understand visibility enum values
- [ ] Check how isPublic maps to visibility
- [ ] Identify all affected endpoints

### Commands to Test Current State
```bash
# Find isPublic usage
grep -rn "isPublic" packages/gateway-core/src/

# Find visibility enum usage
grep -rn "visibility" packages/gateway-core/src/

# Check blob endpoints
ls packages/gateway-core/src/endpoints/blob/
```

---

## Possible Approaches

### Approach A: Remove isPublic Support (Recommended)
**Description**: Remove all isPublic handling, only support visibility enum.

**Pros**:
- Clean codebase
- Single model
- No confusion

**Cons**:
- Breaking change
- Old clients break

**Effort**: Medium

### Approach B: Migration Period
**Description**: Log deprecation warnings, remove later.

**Pros**:
- Softer migration
- Time to update clients

**Cons**:
- Prolongs dual support
- Against guidelines

**Effort**: Higher over time

---

## Recommended Approach

**Approach A: Remove isPublic Support**

Follow the guideline: "remove and break rather than maintain."

---

## Implementation Plan

### Step 1: Audit isPublic Usage
1. List all files with isPublic
2. Document the mapping: isPublic → visibility
3. Check if any endpoints require isPublic

### Step 2: Update Schema
1. Remove isPublic from request schemas
2. Make visibility required
3. Update TypeScript types

### Step 3: Update Endpoints
1. Remove isPublic handling from blob/upload
2. Remove isPublic handling from blob/update
3. Update any metadata handling
4. Remove mapping functions

### Step 4: Update Clients
1. Update SDK if it uses isPublic
2. Update org app if needed
3. Update tests

### Step 5: Clean Up
1. Remove any isPublic utilities
2. Update documentation
3. Version bump

---

## Testing Checklist

### Pre-Implementation Tests (Current State)
- [ ] Test blob upload with isPublic=true
- [ ] Test blob upload with visibility='public'
- [ ] Document current behavior

### Implementation Tests
- [ ] Blob upload rejects isPublic
- [ ] Blob upload requires visibility
- [ ] Valid visibility values work

### Post-Implementation Tests (New State)
- [ ] Only visibility enum works
- [ ] No isPublic in codebase
- [ ] Types are correct

### Regression Tests
- [ ] Blob upload works
- [ ] Blob visibility works
- [ ] Public/private access correct

---

## Visibility Enum Values
```typescript
type BlobVisibility = 'public' | 'private' | 'unlisted';

// Old mapping (to remove)
// isPublic: true  → visibility: 'public'
// isPublic: false → visibility: 'private'
```

---

## Related Issues
- SDK-H01: Deprecated/backwards compatibility code
- GW-L01: Legacy namespace aliasing

---

## Notes
- Coordinate with SDK backwards compat removal
- Major version bump for gateway
- Update API documentation

# GW-H05: Unvalidated namespace parameter allows system key access

## Issue Summary
- **Severity**: HIGH
- **File**: `packages/gateway-core/src/endpoints/kv/set.ts` (lines 25-29)
- **Guideline Violated**: "All external input must be validated"

## Description
Namespace is concatenated directly into KV keys without validation. User could write to `__CREDENTIAL:` or `__IDENTITY:` prefixes, accessing or overwriting system data.

## Impact
- System data manipulation
- Credential theft/injection
- Identity spoofing
- Complete system compromise

---

## Current State Analysis

### What to Test Before Changes
- [ ] Review KV set endpoint
- [ ] Test writing to `__CREDENTIAL:test`
- [ ] Test writing to `__IDENTITY:test`
- [ ] Document system key prefixes

### Commands to Test Current State
```bash
# Review KV set
cat packages/gateway-core/src/endpoints/kv/set.ts

# Find system key prefixes
grep -rn "__CREDENTIAL\|__IDENTITY\|__SYSTEM\|__CHANNEL" packages/gateway-core/src/

# Check key construction
grep -rn "namespace.*key\|key.*namespace" packages/gateway-core/src/
```

---

## Vulnerable Code Pattern

```typescript
// VULNERABLE
const kvKey = `${namespace}:${key}`;
await ctx.kv.put(kvKey, value);

// If namespace = "__CREDENTIAL", this writes to system keys!
```

---

## Possible Approaches

### Approach A: Block Reserved Prefixes (Recommended)
**Description**: Validate namespace doesn't start with reserved prefixes.

**Pros**:
- Simple implementation
- Clear security boundary
- Easy to maintain

**Cons**:
- Need to maintain prefix list

**Effort**: Low

### Approach B: Namespace Prefix Enforcement
**Description**: Require all user namespaces to start with user ID prefix.

**Pros**:
- Structural isolation
- Self-documenting

**Cons**:
- Breaking change
- Migration needed

**Effort**: Medium

---

## Recommended Approach

**Approach A: Block Reserved Prefixes** as immediate fix.
**Approach B** as longer-term solution (see GW-001).

---

## Implementation Plan

### Step 1: Define Reserved Prefixes
```typescript
const SYSTEM_PREFIXES = [
  '__CREDENTIAL',
  '__IDENTITY',
  '__CHANNEL',
  '__SYSTEM',
  '__TOKEN',
  '__GRANT',
  '__META',
];
```

### Step 2: Create Validation Function
```typescript
function validateNamespace(namespace: string): boolean {
  // Check for system prefixes
  for (const prefix of SYSTEM_PREFIXES) {
    if (namespace.startsWith(prefix) || namespace.includes(`:${prefix}`)) {
      return false;
    }
  }

  // Additional validation
  if (namespace.startsWith('_')) return false; // Block all underscore prefixes
  if (namespace.length > 200) return false;
  if (!/^[a-zA-Z0-9_:-]+$/.test(namespace)) return false;

  return true;
}
```

### Step 3: Apply to All KV Endpoints
1. `kv/set.ts` - validate before write
2. `kv/get.ts` - validate before read
3. `kv/delete.ts` - validate before delete
4. `kv/list.ts` - validate namespace

### Step 4: Apply to Blob Endpoints
Same pattern for blob storage.

### Step 5: Add Tests
1. Test blocked prefixes
2. Test valid namespaces
3. Test edge cases

---

## Testing Checklist

### Pre-Implementation Tests (Current State)
- [ ] Try PUT /kv/__CREDENTIAL:test/key
- [ ] Try GET /kv/__IDENTITY:test/key
- [ ] Document current behavior (likely succeeds)

### Implementation Tests
- [ ] System prefix rejected with 400
- [ ] Underscore prefix rejected
- [ ] Valid namespace accepted
- [ ] Error message appropriate

### Post-Implementation Tests (New State)
- [ ] Cannot access system keys via API
- [ ] Normal namespaces work
- [ ] Validation is consistent

### Regression Tests
- [ ] KV operations work
- [ ] Blob operations work
- [ ] Existing namespaces work
- [ ] No false positives

---

## Security Boundary

```
User Namespaces:           System Namespaces:
├── user:alice:settings    ├── __CREDENTIAL:alice
├── user:bob:data          ├── __IDENTITY:user-123
├── app:myapp:state        ├── __CHANNEL:ch-456
└── custom:anything        └── __SYSTEM:config

API blocks access to:       Internal code can access:
├── __CREDENTIAL:*         ├── __CREDENTIAL:*
├── __IDENTITY:*           ├── __IDENTITY:*
├── __*                    └── __*
```

---

## Related Issues
- GW-001: KV/blob namespace ownership validation
- GW-H03: Missing input validation

---

## Notes
- Critical security fix - prioritize
- Consider adding to auth middleware
- Log blocked attempts for monitoring
- Document reserved prefixes

# ORG-H01, H02, H03: Validation and Isolation Issues

## Issue Summary

### ORG-H01: Missing origin validation in AuthorizeFlow
- **File**: `apps/org/src/components/AuthorizeFlow.svelte` (lines 13-24)
- **Guideline Violated**: "All external input must be validated"

### ORG-H02: Insufficient namespace isolation in storage functions
- **Files**: `apps/org/src/lib/kv-storage.ts`, `blob-storage.ts`, `channel-storage.ts` (lines 18-25)
- **Guideline Violated**: "Principle of least privilege"

### ORG-H03: Missing capability string validation
- **File**: `apps/org/src/lib/permissions.ts` (lines 116-128)
- **Guideline Violated**: "All external input must be validated"

---

## ORG-H01: Missing Origin Validation in AuthorizeFlow

### Description
App origin from hash parameters used without URL validation. Malicious origins could be accepted.

### Current State Analysis
- [ ] Review AuthorizeFlow origin handling
- [ ] Test with malicious origin strings
- [ ] Check what the origin is used for
- [ ] Document current validation

### Commands
```bash
grep -n "origin" apps/org/src/components/AuthorizeFlow.svelte
cat apps/org/src/components/AuthorizeFlow.svelte
```

### Fix Plan

```typescript
// Add origin validation
function validateOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);

    // Block dangerous protocols
    if (!['http:', 'https:'].includes(url.protocol)) {
      return false;
    }

    // Block file URLs
    if (url.protocol === 'file:') {
      return false;
    }

    // Optionally: allowlist known origins in production
    // if (!ALLOWED_ORIGINS.includes(url.origin)) return false;

    return true;
  } catch {
    return false;
  }
}

// Use in AuthorizeFlow
const origin = decodeURIComponent(hash.get('origin') || '');
if (!validateOrigin(origin)) {
  throw new Error('Invalid app origin');
}
```

---

## ORG-H02: Insufficient Namespace Isolation

### Description
Origin parameter not validated before hashing for namespace. Could allow namespace collisions or escapes.

### Current State Analysis
- [ ] Review storage namespace generation
- [ ] Check hash function inputs
- [ ] Test with special characters
- [ ] Document namespace model

### Commands
```bash
grep -n "namespace\|origin" apps/org/src/lib/kv-storage.ts
grep -n "namespace\|origin" apps/org/src/lib/blob-storage.ts
grep -n "namespace\|origin" apps/org/src/lib/channel-storage.ts
```

### Fix Plan

```typescript
// Validate origin before hashing
function createNamespace(origin: string): string {
  // Validate origin
  if (!validateOrigin(origin)) {
    throw new Error('Invalid origin for namespace');
  }

  // Normalize origin (remove trailing slashes, etc.)
  const normalized = new URL(origin).origin;

  // Create cryptographic hash
  const hash = crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return `app:${arrayToHex(hash).slice(0, 16)}`;
}
```

---

## ORG-H03: Missing Capability Validation

### Description
Capabilities merged without validating against known valid capabilities. Arbitrary capability strings accepted.

### Current State Analysis
- [ ] Review permissions.ts capability handling
- [ ] Test with invalid capabilities
- [ ] Document valid capabilities
- [ ] Check where capabilities come from

### Commands
```bash
grep -n "capability\|capabilities" apps/org/src/lib/permissions.ts
cat apps/org/src/lib/permissions.ts
```

### Fix Plan

```typescript
// Define valid capabilities
const VALID_CAPABILITIES = new Set([
  'channel:read',
  'channel:write',
  'channel:share',
  'channel:delete',
  'kv:read',
  'kv:write',
  'kv:delete',
  'blob:read',
  'blob:write',
  'blob:delete',
  'identity:read',
]);

function validateCapabilities(capabilities: string[]): string[] {
  const valid: string[] = [];

  for (const cap of capabilities) {
    if (VALID_CAPABILITIES.has(cap)) {
      valid.push(cap);
    } else {
      console.warn(`Unknown capability ignored: ${cap}`);
    }
  }

  return valid;
}

// Use in permission merging
function mergeCapabilities(requested: string[], existing: string[]): string[] {
  const validRequested = validateCapabilities(requested);
  return [...new Set([...existing, ...validRequested])];
}
```

---

## Testing Checklist

### ORG-H01 Tests
- [ ] Valid HTTPS origin accepted
- [ ] javascript: origin rejected
- [ ] data: origin rejected
- [ ] Empty origin rejected
- [ ] Malformed URL rejected

### ORG-H02 Tests
- [ ] Different origins get different namespaces
- [ ] Same origin gets same namespace
- [ ] Special characters handled
- [ ] No namespace collisions

### ORG-H03 Tests
- [ ] Valid capabilities accepted
- [ ] Invalid capabilities rejected
- [ ] Partial valid list filters correctly
- [ ] Empty list handled

### Regression Tests
- [ ] AuthorizeFlow works with valid apps
- [ ] Storage isolation works
- [ ] Permission grants work
- [ ] Apps can access their data

---

## Implementation Priority

1. **ORG-H03** - Capability validation (quick win)
2. **ORG-H01** - Origin validation (security critical)
3. **ORG-H02** - Namespace isolation (defense in depth)

---

## Related Issues
- ORG-001: postMessage wildcard origin
- ORG-002: ClaimFlow payload validation
- GW-H09: Register-app unauthorized operations

---

## Notes
- These are related validation issues in org app
- Consider creating shared validation utilities
- Add validation to security review checklist

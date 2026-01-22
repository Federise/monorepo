# ORG-M01 & M02: Org App Validation Gaps

## Issue Summary
- **Severity**: MEDIUM
- **Files**: `apps/org/src/components/ClaimFlow.svelte`, `apps/org/src/lib/permissions.ts`

---

## Issues

### ORG-M01: URL validation in ClaimFlow token lookup
- **File**: `apps/org/src/components/ClaimFlow.svelte` (lines 122-125)
- **Description**: Gateway URL decoded from base64 but not validated before use

**Current Code**:
```typescript
const gatewayUrl = atob(encodedGateway);
const response = await fetch(`${gatewayUrl}/token/lookup`);
```

**Fix**:
```typescript
const gatewayUrl = atob(encodedGateway);
if (!isValidGatewayUrl(gatewayUrl)) {
  throw new Error('Invalid gateway URL');
}
const response = await fetch(`${gatewayUrl}/token/lookup`);

function isValidGatewayUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Validate protocol
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    // Optional: validate against known gateways
    return true;
  } catch {
    return false;
  }
}
```

### ORG-M02: Insufficient JSON.parse error handling
- **File**: `apps/org/src/lib/permissions.ts` (lines 41-45)
- **Description**: JSON.parse on untrusted gateway data silently fails

**Current Code**:
```typescript
const data = JSON.parse(response);
```

**Fix**:
```typescript
let data: unknown;
try {
  data = JSON.parse(response);
} catch (error) {
  console.error('Failed to parse gateway response:', error);
  throw new Error('Invalid response format');
}

// Then validate structure
const validated = ResponseSchema.parse(data);
```

---

## Implementation Plan

### Step 1: Add URL Validation
1. Create URL validation utility
2. Apply to ClaimFlow
3. Add to other URL handling

### Step 2: Improve JSON Parsing
1. Wrap JSON.parse in try/catch
2. Add schema validation
3. Provide meaningful errors

---

## Testing Checklist

### URL Validation Tests
- [ ] Valid HTTPS URLs accepted
- [ ] Invalid protocols rejected
- [ ] Malformed URLs rejected

### JSON Parsing Tests
- [ ] Valid JSON parsed correctly
- [ ] Invalid JSON handled gracefully
- [ ] Wrong structure detected

---

## Notes
- These are quick fixes
- Add to validation checklist

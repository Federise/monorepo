# ORG-002: ClaimFlow accepts arbitrary share payloads without full validation

## Issue Summary
- **Severity**: CRITICAL
- **File**: `apps/org/src/components/ClaimFlow.svelte` (lines 86-112)
- **Guideline Violated**: "All external input must be validated"

## Description
Share link mode accepts base64-encoded payloads with minimal validation. No URL format validation, no capability whitelist validation.

## Impact
- Malicious URLs could be injected
- Arbitrary capability strings accepted
- Potential for privilege escalation through crafted payloads

---

## Current State Analysis

### What to Test Before Changes
- [ ] Review ClaimFlow share link parsing
- [ ] Test with malformed payloads
- [ ] Test with malicious URLs
- [ ] Test with invalid capabilities
- [ ] Document current validation

### Commands to Test Current State
```bash
# Review ClaimFlow
cat apps/org/src/components/ClaimFlow.svelte

# Look for validation
grep -rn "validate\|check\|verify" apps/org/src/components/ClaimFlow.svelte

# Check share token parsing
grep -rn "base64\|decode\|parse" apps/org/src/components/ClaimFlow.svelte
```

---

## Possible Approaches

### Approach A: Comprehensive Schema Validation (Recommended)
**Description**: Define strict schema for share payloads, validate all fields.

**Pros**:
- Complete validation
- Type safety
- Clear error messages

**Cons**:
- More code
- Need to define all valid values

**Effort**: Medium

### Approach B: Field-by-Field Validation
**Description**: Add individual validation for each payload field.

**Pros**:
- Incremental implementation
- Targeted fixes

**Cons**:
- May miss edge cases
- Less systematic

**Effort**: Low-Medium

### Approach C: Signed Payloads
**Description**: Require payloads to be cryptographically signed by the gateway.

**Pros**:
- Tamper-proof
- Server validates payload

**Cons**:
- Major architectural change
- Requires gateway changes
- Breaking change for existing shares

**Effort**: High

---

## Recommended Approach

**Approach A: Comprehensive Schema Validation**

Use Zod to define and validate the complete share payload schema. Validate all fields including URLs, capabilities, and structural requirements.

---

## Implementation Plan

### Step 1: Define Share Payload Schema
1. Document expected payload structure
2. Create Zod schema for payload
3. Define valid capability strings
4. Define URL validation rules

### Step 2: Implement URL Validation
1. Create URL validator function
2. Enforce https:// protocol (in production)
3. Block dangerous protocols (javascript:, data:)
4. Optionally validate against allowed domains

### Step 3: Implement Capability Validation
1. Define whitelist of valid capabilities
2. Reject unknown capabilities
3. Validate capability format

### Step 4: Implement Full Payload Validation
1. Validate base64 encoding
2. Validate JSON structure
3. Validate all fields against schema
4. Return clear error messages

### Step 5: Update ClaimFlow
1. Replace minimal validation with full validation
2. Handle validation errors gracefully
3. Show user-friendly error messages
4. Log validation failures for monitoring

---

## Testing Checklist

### Pre-Implementation Tests (Current State)
- [ ] Test with valid share payload
- [ ] Test with invalid base64
- [ ] Test with javascript: URL
- [ ] Test with data: URL
- [ ] Test with invalid capability strings
- [ ] Test with missing required fields
- [ ] Test with extra unexpected fields
- [ ] Document current behavior for each

### Implementation Tests
- [ ] Unit tests for payload schema
- [ ] Unit tests for URL validation
- [ ] Unit tests for capability validation
- [ ] Test error messages are clear
- [ ] Test no sensitive data in errors

### Post-Implementation Tests (New State)
- [ ] Valid payloads still work
- [ ] Invalid payloads are rejected
- [ ] Malicious URLs are blocked
- [ ] Unknown capabilities are rejected
- [ ] Error messages are user-friendly

### Regression Tests
- [ ] Existing share links still work
- [ ] ClaimFlow completes successfully
- [ ] Credentials are stored correctly
- [ ] User can access shared resources
- [ ] Share link generation still works

---

## Share Payload Schema

```typescript
import { z } from 'zod';

// Define valid capabilities
const ValidCapabilities = [
  'channel:read',
  'channel:write',
  'channel:share',
  'kv:read',
  'kv:write',
  'blob:read',
  'blob:write',
  // ... add all valid capabilities
] as const;

// URL validation
const SafeUrlSchema = z.string().refine((url) => {
  try {
    const parsed = new URL(url);
    // Block dangerous protocols
    if (['javascript:', 'data:', 'vbscript:'].includes(parsed.protocol)) {
      return false;
    }
    // Optionally enforce https in production
    // if (parsed.protocol !== 'https:') return false;
    return true;
  } catch {
    return false;
  }
}, 'Invalid or unsafe URL');

// Capability validation
const CapabilitySchema = z.enum(ValidCapabilities);

// Share payload schema
const SharePayloadSchema = z.object({
  token: z.string().min(1).max(1000),
  gatewayUrl: SafeUrlSchema,
  capabilities: z.array(CapabilitySchema).optional(),
  channelId: z.string().optional(),
  expiresAt: z.number().optional(),
  // Add other expected fields
});

// Validate function
export function validateSharePayload(input: unknown): SharePayload {
  return SharePayloadSchema.parse(input);
}
```

---

## URL Validation Details

### Blocked Protocols
- `javascript:` - Script execution
- `data:` - Embedded data (can execute scripts)
- `vbscript:` - Script execution (IE)
- `file:` - Local file access

### Allowed Protocols
- `https:` - Secure HTTP (preferred)
- `http:` - Insecure HTTP (dev only)

### Additional Checks
- Maximum URL length
- Valid hostname format
- No embedded credentials

---

## Related Issues
- SDK-003: Token parsing validation
- ORG-H01: Missing origin validation in AuthorizeFlow
- ORG-M01: URL validation in ClaimFlow token lookup

---

## Notes
- This is a security-critical fix
- Consider backwards compatibility with existing share links
- May want to add share link versioning
- Consider rate limiting share claims

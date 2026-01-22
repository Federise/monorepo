# SDK-H02: Error handling exposes internal details

## Issue Summary
- **Severity**: HIGH
- **File**: `packages/sdk/src/client.ts`
- **Guideline Violated**: "Third party apps never see gateway endpoints"

## Description
Error messages passed to apps may contain internal system details including gateway URLs, internal paths, and other sensitive information.

## Impact
- Information disclosure to third-party apps
- Aids attackers in understanding system architecture
- Violates principle of minimal information exposure

---

## Current State Analysis

### What to Test Before Changes
- [ ] Audit all error messages in SDK
- [ ] Check what details are included in errors
- [ ] Test various error scenarios
- [ ] Document exposed information types

### Commands to Test Current State
```bash
# Find error construction
grep -rn "new Error\|Error(\|throw" packages/sdk/src/

# Find error messages with potential sensitive data
grep -rn "error.*url\|error.*gateway\|error.*token" packages/sdk/src/

# Check error handling patterns
grep -rn "catch\|\.catch" packages/sdk/src/
```

---

## Types of Information That May Leak

1. **Gateway URLs** - Internal infrastructure endpoints
2. **Stack traces** - Internal file paths and structure
3. **Request details** - Headers, tokens, params
4. **System errors** - Database errors, file paths
5. **Configuration** - Internal settings

---

## Possible Approaches

### Approach A: Error Sanitization Layer (Recommended)
**Description**: Add error sanitization at SDK boundary.

**Pros**:
- Comprehensive coverage
- Single point of control
- Preserves internal debugging

**Cons**:
- Adds processing overhead
- May obscure useful error info

**Effort**: Medium

### Approach B: Error Code System
**Description**: Replace messages with error codes.

**Pros**:
- No sensitive data by design
- Consistent error handling

**Cons**:
- Worse developer experience
- Requires documentation

**Effort**: High

---

## Recommended Approach

**Approach A: Error Sanitization Layer**

Create a sanitization function that strips sensitive information from errors before they reach apps.

---

## Implementation Plan

### Step 1: Audit Error Messages
1. List all error throw/return points
2. Document what info is included
3. Categorize by sensitivity

### Step 2: Create Sanitization Utility
```typescript
// packages/sdk/src/utils/error-sanitizer.ts
const SENSITIVE_PATTERNS = [
  /https?:\/\/[^\s]+/g,  // URLs
  /Bearer [^\s]+/g,       // Tokens
  /api[_-]?key[=:][^\s]+/gi, // API keys
];

export function sanitizeError(error: unknown): Error {
  if (!(error instanceof Error)) {
    return new Error('An unexpected error occurred');
  }

  let message = error.message;
  for (const pattern of SENSITIVE_PATTERNS) {
    message = message.replace(pattern, '[REDACTED]');
  }

  const sanitized = new Error(message);
  sanitized.name = error.name;
  // Don't copy stack trace to apps
  return sanitized;
}
```

### Step 3: Apply at SDK Boundary
1. Wrap all public methods
2. Catch and sanitize errors
3. Re-throw sanitized version

### Step 4: Add Error Codes
1. Define error code enum
2. Add code property to errors
3. Document error codes

### Step 5: Update Tests
1. Test sanitization works
2. Test error codes are correct
3. Test no leakage

---

## Testing Checklist

### Pre-Implementation Tests (Current State)
- [ ] Force various error conditions
- [ ] Capture error messages
- [ ] Document sensitive data exposure

### Implementation Tests
- [ ] Sanitization removes URLs
- [ ] Sanitization removes tokens
- [ ] Error codes are present
- [ ] Original error logged internally

### Post-Implementation Tests (New State)
- [ ] No sensitive data in error messages
- [ ] Errors still useful for debugging
- [ ] Error codes work correctly

### Regression Tests
- [ ] Error handling still works
- [ ] Apps can catch errors
- [ ] Error types preserved
- [ ] Async errors handled

---

## Related Issues
- SDK-002: Gateway URLs exposed in response messages
- PROXY-M02: Gateway URL exposed in token creation responses

---

## Notes
- Consider adding debug mode for development
- Log full errors server-side for troubleshooting
- Document error codes for SDK consumers

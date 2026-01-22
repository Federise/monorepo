# SDK-002: Gateway URLs exposed in response messages

## Issue Summary
- **Severity**: CRITICAL
- **File**: `packages/sdk/src/client.ts`
- **Guideline Violated**: "Third party apps never see secrets, credentials, or gateway endpoints"

## Description
Error messages and debug info may contain gateway URLs. Third party apps can see gateway endpoints they shouldn't have access to.

## Impact
- Leaks infrastructure details to untrusted apps
- Could enable targeted attacks on gateway
- Violates principle of hiding infrastructure from apps

---

## Current State Analysis

### What to Test Before Changes
- [ ] Search for gateway URL references in error messages
- [ ] Check console.log/debug statements for URL exposure
- [ ] Review error response formats
- [ ] Test error scenarios and inspect responses
- [ ] Check if URLs appear in stack traces

### Commands to Test Current State
```bash
# Find potential URL exposure in errors
grep -rn "error.*gateway\|gateway.*error" packages/sdk/src/
grep -rn "throw.*url\|url.*throw" packages/sdk/src/
grep -rn "console\." packages/sdk/src/

# Check error message construction
grep -rn "Error\(" packages/sdk/src/
grep -rn "new Error" packages/sdk/src/

# Run tests and check error output
pnpm test --filter=@federise/sdk
```

---

## Possible Approaches

### Approach A: Sanitize All Error Messages (Recommended)
**Description**: Create an error sanitization layer that strips sensitive information before errors reach apps.

**Pros**:
- Comprehensive solution
- Can be applied at SDK boundary
- Doesn't change internal error handling

**Cons**:
- Might obscure debugging info needed by developers
- Need to balance security vs. debuggability

**Effort**: Medium

### Approach B: Use Error Codes Instead of Messages
**Description**: Replace descriptive error messages with error codes, provide separate error lookup.

**Pros**:
- No sensitive info in errors by design
- Consistent error handling

**Cons**:
- Worse developer experience
- Requires error code documentation
- Breaking change for error handling

**Effort**: High

### Approach C: Two-Tier Error System
**Description**: Internal errors have full details, public errors are sanitized versions.

**Pros**:
- Maintains internal debugging capability
- Clean separation of concerns

**Cons**:
- More complex error handling
- Need to ensure internal errors don't leak

**Effort**: Medium

---

## Recommended Approach

**Approach A: Sanitize All Error Messages** combined with elements of **Approach C**

Create an error boundary at the SDK public API that sanitizes any gateway URLs or internal details before errors reach the app.

---

## Implementation Plan

### Step 1: Audit Current Error Handling
1. Find all places errors are thrown or returned
2. Document error message templates
3. Identify what sensitive data appears in errors

### Step 2: Create Error Sanitization Utility
1. Create `sanitizeError()` function
2. Define patterns to strip (URLs, tokens, keys)
3. Create safe replacement messages

### Step 3: Create SDK Error Boundary
1. Wrap all public SDK methods with error boundary
2. Apply sanitization to all errors before returning
3. Log original error internally (if needed for debugging)

### Step 4: Update Error Classes
1. Review custom error classes
2. Ensure error constructors don't embed sensitive data
3. Add error codes for common scenarios

### Step 5: Remove Debug Logging
1. Remove console.log statements in production code
2. Replace with conditional debug logging
3. Ensure debug logging is disabled by default

---

## Testing Checklist

### Pre-Implementation Tests (Current State)
- [ ] Document all error messages that contain URLs
- [ ] List all console.log statements in SDK
- [ ] Test error scenarios and capture error content
- [ ] Check stack traces for sensitive data

### Implementation Tests
- [ ] Unit tests for sanitizeError() function
- [ ] Tests that verify URLs are stripped from various error types
- [ ] Tests that error codes work correctly
- [ ] Tests that sanitization doesn't break error handling flow

### Post-Implementation Tests (New State)
- [ ] No error messages contain gateway URLs
- [ ] No error messages contain API keys or tokens
- [ ] Stack traces don't expose sensitive data
- [ ] Errors still provide useful debugging info
- [ ] Error codes map to correct error types

### Regression Tests
- [ ] All existing error handling tests pass
- [ ] Apps can still handle errors appropriately
- [ ] Error types are preserved (can distinguish error kinds)
- [ ] Async error handling still works
- [ ] Promise rejections are sanitized
- [ ] Error event handlers work
- [ ] Try/catch blocks in apps still work

---

## Related Issues
- SDK-001: ChannelClient makes direct fetch calls
- SDK-H02: Error handling exposes internal details
- PROXY-M02: Gateway URL exposed in token creation responses

---

## Notes
- Consider adding telemetry for internal error logging (with consent)
- May want to provide "debug mode" for development that shows full errors
- Document error codes for SDK consumers

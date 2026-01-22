# SDK-003: Token parsing does not validate input

## Issue Summary
- **Severity**: CRITICAL
- **File**: `packages/sdk/src/client.ts`
- **Guideline Violated**: "All external input must be validated"

## Description
Token parsing functions do not properly validate the input format before processing. Malformed tokens could cause unexpected behavior.

## Impact
- Malformed tokens could cause crashes or undefined behavior
- Potential for injection attacks through malformed token data
- Could be exploited to cause DoS or access violations

---

## Current State Analysis

### What to Test Before Changes
- [ ] Identify all token parsing functions
- [ ] Test with various malformed inputs
- [ ] Document current error handling behavior
- [ ] Check for try/catch around parsing code
- [ ] Identify token format expectations

### Commands to Test Current State
```bash
# Find token parsing code
grep -rn "parse.*token\|token.*parse" packages/sdk/src/
grep -rn "decode.*token\|token.*decode" packages/sdk/src/
grep -rn "base64\|atob\|btoa" packages/sdk/src/

# Check validation patterns
grep -rn "validate\|isValid" packages/sdk/src/

# Look for JSON parsing
grep -rn "JSON.parse" packages/sdk/src/
```

---

## Possible Approaches

### Approach A: Schema Validation with Zod (Recommended)
**Description**: Use Zod to define and validate token schemas.

**Pros**:
- Type-safe validation
- Clear error messages
- Zod already used in project
- Composable schemas

**Cons**:
- Adds runtime overhead
- Schema must stay in sync with actual format

**Effort**: Medium

### Approach B: Manual Validation Functions
**Description**: Write custom validation functions for each token type.

**Pros**:
- No additional dependencies
- Full control over validation logic
- Can be optimized for performance

**Cons**:
- More code to maintain
- Higher risk of validation gaps
- Less type safety

**Effort**: Medium

### Approach C: Fail-Fast with Type Guards
**Description**: Use TypeScript type guards to validate at runtime.

**Pros**:
- TypeScript integration
- Can catch issues at parse time
- Clear type narrowing

**Cons**:
- Limited to type checking, not value validation
- May miss semantic validation

**Effort**: Low

---

## Recommended Approach

**Approach A: Schema Validation with Zod**

Zod provides comprehensive validation with good TypeScript integration. Define schemas for all token formats and validate at parse time.

---

## Implementation Plan

### Step 1: Document Token Formats
1. List all token types in the system
2. Document expected structure for each
3. Document encoding format (base64, etc.)

### Step 2: Create Zod Schemas
1. Define schema for share tokens
2. Define schema for channel tokens
3. Define schema for invite tokens
4. Define schemas for any other token types

### Step 3: Implement Validation Functions
1. Create `validateShareToken(input: unknown): ShareToken`
2. Create `validateChannelToken(input: unknown): ChannelToken`
3. Add proper error handling with descriptive messages
4. Handle base64 decoding errors gracefully

### Step 4: Update Parsing Code
1. Replace direct parsing with validated parsing
2. Wrap in try/catch with appropriate error handling
3. Return typed results on success
4. Return sanitized errors on failure

### Step 5: Add Input Sanitization
1. Check for maximum length before parsing
2. Validate character set (base64 valid chars)
3. Reject obviously malformed input early

---

## Testing Checklist

### Pre-Implementation Tests (Current State)
- [ ] Test parsing with null/undefined input
- [ ] Test parsing with empty string
- [ ] Test parsing with invalid base64
- [ ] Test parsing with valid base64 but invalid JSON
- [ ] Test parsing with valid JSON but wrong structure
- [ ] Test parsing with extremely long input
- [ ] Test parsing with special characters
- [ ] Document current behavior for each case

### Implementation Tests
- [ ] Unit tests for each Zod schema
- [ ] Unit tests for validation functions
- [ ] Test error messages are sanitized
- [ ] Test performance is acceptable
- [ ] Test type inference works correctly

### Post-Implementation Tests (New State)
- [ ] All malformed inputs are rejected with clear errors
- [ ] Valid tokens still parse correctly
- [ ] Error messages don't expose internal details
- [ ] TypeScript types work correctly
- [ ] No crashes on any input

### Regression Tests
- [ ] All existing token-based features work
- [ ] Share links still work
- [ ] Channel tokens still work
- [ ] Token refresh flows still work
- [ ] Token expiration is handled correctly
- [ ] Apps using tokens still work
- [ ] Token-based authentication still works

---

## Token Format Reference

### Expected Token Structure (to document)
```typescript
// Share Token
interface ShareToken {
  // TODO: document actual structure
}

// Channel Token
interface ChannelToken {
  // TODO: document actual structure
}
```

---

## Related Issues
- ORG-002: ClaimFlow accepts arbitrary share payloads
- GW-H05: Unvalidated namespace parameter

---

## Notes
- Consider adding token version field for future extensibility
- May want to add integrity check (signature) to tokens
- Document token format in developer docs

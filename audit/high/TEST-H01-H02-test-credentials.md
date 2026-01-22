# TEST-H01 & TEST-H02: Test Credential Handling Issues

## Issue Summary

### TEST-H01: Gateway API key stored in client localStorage
- **File**: `test/e2e/setup.ts` (lines 83-91)
- **Guideline Violated**: "No secrets in client-side code"
- **Description**: Test setup stores API key in org app localStorage

### TEST-H02: API key stored as cookie
- **File**: `test/self-test/e2e-browser/sdk-frame.spec.ts` (lines 46-47)
- **Guideline Violated**: "Principle of least privilege"
- **Description**: API key stored as HTTP cookie accessible to cross-origin requests

---

## Context: Test Code vs Production Code

These issues are in test code, not production code. However:
1. Test code reflects expected patterns
2. Test code may leak into examples
3. Security habits should be consistent

---

## TEST-H01: API Key in Test Client localStorage

### Description
The test setup injects API keys directly into localStorage for the org app. This doesn't match the production security model.

### Current State Analysis
- [ ] Review test setup code
- [ ] Understand why this approach was used
- [ ] Check if tests work without direct injection
- [ ] Document test credential flow

### Commands
```bash
cat test/e2e/setup.ts
grep -n "localStorage\|apiKey\|API_KEY" test/e2e/setup.ts
```

### The Problem
```typescript
// CURRENT - Direct injection
await page.evaluate((key) => {
  localStorage.setItem('gateway-api-key', key);
}, apiKey);
```

### Fix Approaches

**Option A: Use Production Claim Flow**
```typescript
// Use actual share link/claim flow
await page.goto(`http://localhost:4321/claim#${shareToken}`);
await page.waitForSelector('[data-testid="claim-success"]');
```

**Option B: Accept for Test Isolation**
Document that test setup uses shortcuts for speed, but production uses proper flows.

---

## TEST-H02: API Key as Cookie

### Description
API key stored as HTTP cookie which could be accessible to cross-origin requests if not properly configured.

### Current State Analysis
- [ ] Review test file
- [ ] Check cookie configuration
- [ ] Verify httpOnly/sameSite settings
- [ ] Understand why cookie approach used

### Commands
```bash
cat test/self-test/e2e-browser/sdk-frame.spec.ts
grep -n "cookie\|Cookie" test/self-test/e2e-browser/sdk-frame.spec.ts
```

### Fix Approaches

**Option A: Remove Cookie Usage**
Don't use cookies for API keys in tests.

**Option B: Use Secure Cookie Settings**
```typescript
await page.context().addCookies([{
  name: 'api-key',
  value: apiKey,
  domain: 'localhost',
  path: '/',
  httpOnly: true,  // Not accessible to JS
  sameSite: 'Strict',  // No cross-origin
  secure: false,  // OK for localhost
}]);
```

---

## Recommended Approach

1. **Document Test Shortcuts**: Create test documentation explaining that test setup uses shortcuts
2. **Use Production Flows Where Possible**: Have at least some tests use real credential flows
3. **Isolate Test Credentials**: Ensure test API keys are clearly test-only

---

## Implementation Plan

### Step 1: Audit Test Credential Usage
1. Find all places API keys are injected
2. Document each usage pattern
3. Assess risk of each

### Step 2: Add Test Documentation
```markdown
# Test Credential Handling

## Why Tests Use Shortcuts

E2E tests inject credentials directly for:
- Speed (avoiding UI flows)
- Isolation (predictable state)
- Simplicity (fewer moving parts)

## Production Difference

In production, credentials flow through:
1. Share link claiming
2. OAuth flows
3. Bootstrap provisioning

Tests that verify these flows exist in:
- test/e2e/claim-flow.spec.ts
- test/e2e/auth-flow.spec.ts
```

### Step 3: Add Production Flow Tests
Ensure at least some tests use real credential flows:
- Test claim flow end-to-end
- Test authorization flow end-to-end
- Test bootstrap provisioning

### Step 4: Secure Test Cookie Usage
If cookies are needed, use secure settings.

---

## Testing Checklist

### Audit Tests
- [ ] List all credential injection points
- [ ] Document reason for each
- [ ] Identify any that should change

### Documentation Tests
- [ ] Test docs explain shortcuts
- [ ] Production flow differences documented

### Security Tests
- [ ] Test cookies have secure settings
- [ ] Test API keys not in source code
- [ ] Test credentials properly isolated

---

## Related Issues
- DOC-003: Security vulnerabilities documented
- PROXY-H02: Plaintext localStorage storage

---

## Notes
- Test code standards matter
- Balance speed vs. realism in tests
- Document intentional deviations
- Consider test-specific API keys

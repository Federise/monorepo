# TEST-M01 through M03: Test Quality Issues

## Issue Summary
- **Severity**: MEDIUM
- **Files**: Various test files
- **Description**: Test patterns that don't match production or could be improved

---

## Issues

### TEST-M01: Direct gateway API calls in tests
- **File**: `test/self-test/integration.test.ts`
- **Description**: Tests make direct HTTP calls instead of going through SDK

**Concern**: Tests should validate the actual SDK flow when possible.

**Fix Options**:
1. Add SDK-based integration tests
2. Keep direct tests for gateway testing
3. Document purpose clearly

### TEST-M02: Test-only SDK methods bypass permission system
- **File**: `test/org-tests/src/tests.ts` (lines 88, 125, 183, 259)
- **Description**: Uses `_testGrantPermissions()` to bypass authorization

**Concern**: Production code may not work if only tested with bypass.

**Fix**:
```typescript
// Option A: Test real flow in some tests
test('permission grant flow', async () => {
  // Actual UI flow
  await page.click('[data-testid="grant-button"]');
  await expect(permissions).toContain('channel:read');
});

// Option B: Document bypass tests clearly
test('channel operations (with test permissions)', async () => {
  // BYPASS: Using test permissions for speed
  sdk._testGrantPermissions(['channel:read']);
  // ...
});
```

### TEST-M03: Org app configured with credentials
- **File**: `test/e2e/setup.ts` (line 89)
- **Description**: Org app configured with gateway credentials directly

**Concern**: Doesn't test actual credential flow.

**Fix**: Add tests that use real credential flows alongside shortcut tests.

---

## Implementation Plan

### Step 1: Categorize Tests
1. Unit tests (can use shortcuts)
2. Integration tests (should be more realistic)
3. E2E tests (should test real flows)

### Step 2: Add Flow Tests
1. Test real permission grant flow
2. Test real credential claim flow
3. Test real auth flow

### Step 3: Document Test Approaches
```markdown
# Test Approaches

## Unit Tests
- Fast, isolated
- May use mocks and shortcuts

## Integration Tests
- Test component interactions
- May use test utilities

## E2E Tests
- Test real user flows
- Minimal shortcuts
```

---

## Testing Checklist

### Test Coverage
- [ ] Real flows tested somewhere
- [ ] Shortcut usage documented
- [ ] Balance of speed vs. realism

### Documentation
- [ ] Test categories documented
- [ ] Shortcut reasons explained

---

## Notes
- Balance test speed with realism
- Document shortcuts clearly
- Ensure real flows are tested somewhere

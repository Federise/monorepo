# TEST-L01 through L03: Test Polish Issues

## Issue Summary
- **Severity**: LOW
- **Files**: Various test files

---

## Issues

### TEST-L01: Hardcoded bootstrap key
Some tests have hardcoded bootstrap keys.

**Fix**: Use environment variables or test fixtures.

```typescript
// Before
const bootstrapKey = 'test-bootstrap-key-12345';

// After
const bootstrapKey = process.env.TEST_BOOTSTRAP_KEY || generateTestKey();
```

### TEST-L02: Inconsistent env var naming
Environment variables use inconsistent naming patterns.

**Fix**: Standardize to `FEDERISE_*` prefix.

```typescript
// Inconsistent
const apiKey = process.env.API_KEY;
const gatewayUrl = process.env.GATEWAY_URL;
const testKey = process.env.TEST_KEY;

// Consistent
const apiKey = process.env.FEDERISE_API_KEY;
const gatewayUrl = process.env.FEDERISE_GATEWAY_URL;
const testKey = process.env.FEDERISE_TEST_KEY;
```

### TEST-L03: Undocumented test methods
Test-only SDK methods lack documentation.

**Fix**: Add JSDoc explaining purpose and when to use.

```typescript
/**
 * TEST ONLY: Grants permissions without UI flow.
 * Use only in tests where actual permission flow is tested elsewhere.
 * @internal
 */
_testGrantPermissions(capabilities: string[]): void {
  // ...
}
```

---

## Testing Checklist

### TEST-L01 Tests
- [ ] No hardcoded secrets in tests
- [ ] Test fixtures used appropriately

### TEST-L02 Tests
- [ ] Env vars follow naming convention
- [ ] Documentation updated

### TEST-L03 Tests
- [ ] Test methods documented
- [ ] Usage patterns clear

---

## Notes
- These are quality of life improvements
- Do during general cleanup

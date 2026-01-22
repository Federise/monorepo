# SDK-M01 through M15: Pattern Inconsistencies

## Issue Summary
- **Severity**: MEDIUM
- **Files**: Throughout `packages/sdk/src/`
- **Guideline Violated**: "Follow existing patterns"

## Description
Various pattern inconsistencies across the SDK including:
- Inconsistent error handling
- Varying function signatures
- Mixed async patterns

---

## Issues Inventory

| ID | Description | File(s) |
|----|-------------|---------|
| M01 | Inconsistent error handling | client.ts |
| M02 | Varying function signatures | channel-client.ts |
| M03 | Mixed async patterns | various |
| M04-M15 | Additional inconsistencies | various |

---

## Common Patterns to Standardize

### Error Handling Pattern
```typescript
// STANDARD: Use Result type or consistent throw
async function operation(): Promise<Result<T>> {
  try {
    const data = await doSomething();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: normalizeError(error) };
  }
}
```

### Function Signature Pattern
```typescript
// STANDARD: Options object for 2+ params
async function createChannel(options: CreateChannelOptions): Promise<Channel>;

// NOT: positional params
async function createChannel(name: string, description: string, visibility: string): Promise<Channel>;
```

### Async Pattern
```typescript
// STANDARD: async/await throughout
async function doWork() {
  const result = await step1();
  const next = await step2(result);
  return next;
}

// NOT: mixed promises and callbacks
function doWork() {
  return step1().then(result => {
    step2(result, callback);
  });
}
```

---

## Implementation Plan

### Step 1: Audit Patterns
1. Review all SDK functions
2. Document current patterns used
3. Identify inconsistencies

### Step 2: Define Standard Patterns
1. Error handling standard
2. Function signature standard
3. Async pattern standard
4. Naming convention standard

### Step 3: Apply Consistently
1. Refactor error handling
2. Update function signatures
3. Standardize async patterns
4. Update types

### Step 4: Add Linting
1. ESLint rules for patterns
2. Custom rules if needed
3. CI enforcement

---

## Testing Checklist

### Pre-Implementation
- [ ] Document current patterns
- [ ] Identify all inconsistencies
- [ ] Assess breaking changes

### Implementation
- [ ] Error handling consistent
- [ ] Signatures consistent
- [ ] Async patterns consistent

### Post-Implementation
- [ ] All tests pass
- [ ] TypeScript compiles
- [ ] Linting passes

### Regression
- [ ] SDK API unchanged or documented
- [ ] Apps still work
- [ ] Error handling still works

---

## Notes
- Consider semver for breaking changes
- Document patterns in CONTRIBUTING.md
- Add pattern tests

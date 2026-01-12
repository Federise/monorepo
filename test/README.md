# Testing Guide

This monorepo uses different testing approaches for different components due to their runtime requirements.

## Test Locations

| Component | Location | Framework | Runtime |
|-----------|----------|-----------|---------|
| Gateway (Cloudflare) | `apps/gateway/test/` | Vitest | Cloudflare Workers |
| Gateway (Self-hosted) | `apps/self/test/` | Deno Test | Deno |
| SDK Browser Tests | `apps/org/tests/` | Custom Harness | Browser |
| E2E Browser Tests | `apps/self/test/e2e-browser/` | Playwright | Browser |

## Running Tests

### Gateway (Cloudflare Workers)

Tests for the Cloudflare Workers gateway using Vitest with the Workers pool.

```bash
cd apps/gateway
pnpm test
```

### Gateway (Self-hosted / Deno)

Integration tests for the self-hosted Deno gateway.

```bash
cd apps/self
deno task test

# Watch mode
deno task test:watch
```

### SDK Browser Tests (Interactive)

Interactive test harness for testing the SDK in a real browser environment. Requires the org app to be running.

```bash
# Terminal 1: Start the org app
cd apps/org
pnpm dev

# Terminal 2: Start the test harness
cd apps/org
pnpm test:frame

# Open http://localhost:5174 in browser
```

### E2E Browser Tests (Playwright)

Automated browser tests using Playwright.

```bash
cd apps/self/test/e2e-browser
pnpm install
pnpm exec playwright test
```

## Test Categories

### Unit Tests
Currently no unit tests. All testing is integration/E2E level.

### Integration Tests
- `apps/gateway/test/e2e.test.ts` - Gateway API integration tests
- `apps/self/test/integration.test.ts` - Self-hosted gateway integration tests

### E2E/Browser Tests
- `apps/org/tests/` - SDK + Frame communication tests (manual)
- `apps/self/test/e2e-browser/` - Full browser automation (Playwright)

## Writing New Tests

### For Gateway Features
Add tests to `apps/gateway/test/` using Vitest syntax:
```typescript
import { describe, it, expect } from 'vitest';

describe('MyFeature', () => {
  it('should work', () => {
    expect(true).toBe(true);
  });
});
```

### For Self-hosted Features
Add tests to `apps/self/test/` using Deno Test syntax:
```typescript
import { assertEquals } from "jsr:@std/assert";

Deno.test("my test", () => {
  assertEquals(1 + 1, 2);
});
```

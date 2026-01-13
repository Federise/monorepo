# Testing Strategy and Requirements

## Overview

The Federise monorepo employs a multi-layered testing strategy with three distinct test suites targeting different runtime environments. The approach is integration-focused with no unit tests, relying on E2E and API testing to validate functionality.

## Test Architecture

### Test Suite Distribution

| Suite | Location | Framework | Runtime | Tests |
|-------|----------|-----------|---------|-------|
| Gateway (Cloudflare) | `test/gateway-test/` | Vitest + cloudflare:test | Workers | ~27 |
| Gateway (Self-hosted) | `test/self-test/` | Deno Test | Deno | ~27 |
| E2E Browser | `test/self-test/e2e-browser/` | Playwright | Chromium | ~9 |
| SDK Frame | `test/org-tests/` | Custom Harness | Browser | ~15 |

**Total Tests:** ~78

### Test Type Balance

```
Test Distribution:
├── Unit Tests: 0 (0%)
├── Integration Tests: ~75 (96%)
│   ├── Cloudflare Gateway: 27 tests
│   ├── Deno Gateway: 27 tests
│   └── Presigned operations: 6 tests
└── E2E/Browser Tests: ~24 (4%)
    ├── Playwright: 9 tests
    └── SDK Frame: 15 tests
```

## Framework Configuration

### Vitest + Cloudflare Workers

```typescript
// test/gateway-test/e2e.test.ts
import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';

describe('KV Gateway E2E Tests', () => {
  beforeEach(async () => {
    // Clear KV before each test
    const list = await env.KV.list();
    await Promise.all(list.keys.map(k => env.KV.delete(k.name)));
  });

  it('should create principal', async () => {
    const response = await SELF.fetch('http://localhost/principal/create', {
      method: 'POST',
      headers: { Authorization: `ApiKey ${BOOTSTRAP_KEY}` },
      body: JSON.stringify({ display_name: 'Admin' })
    });
    expect(response.status).toBe(200);
  });
});
```

### Deno Test

```typescript
// test/self-test/integration.test.ts
import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { testFetch, getOrCreateAdminKey, uniqueNamespace } from './setup.ts';

Deno.test({
  name: 'KV Operations',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const apiKey = await getOrCreateAdminKey();
    const namespace = uniqueNamespace('kv');

    const response = await testFetch('/kv/set', {
      method: 'POST',
      headers: { Authorization: `ApiKey ${apiKey}` },
      body: JSON.stringify({ namespace, key: 'test', value: 'value' })
    });
    assertEquals(response.status, 204);
  }
});
```

### Playwright

```typescript
// test/self-test/e2e-browser/playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  forbidOnly: !!process.env.CI,
  webServer: [
    {
      command: 'cd ../../apps/self && deno task start',
      url: 'http://localhost:3000/openapi',
      reuseExistingServer: !process.env.CI,
      env: {
        BOOTSTRAP_API_KEY: 'test-bootstrap-key-for-e2e',
        BLOB_STORAGE: 'filesystem',
        CORS_ORIGIN: '*'
      }
    }
  ]
});
```

## Test Coverage Areas

### Principal Management

| Test | Gateway | Self-Hosted | Browser |
|------|---------|-------------|---------|
| Bootstrap principal creation | ✓ | ✓ | - |
| Principal listing | ✓ | ✓ | - |
| Additional principal creation | ✓ | ✓ | - |
| Principal deletion | ✓ | - | - |
| Auth rejection (invalid key) | ✓ | ✓ | ✓ |
| Auth rejection (malformed header) | ✓ | ✓ | - |
| Bootstrap key isolation | ✓ | - | - |

### KV Operations

| Test | Gateway | Self-Hosted | Browser |
|------|---------|-------------|---------|
| Basic set/get | ✓ | ✓ | ✓ |
| 404 for missing keys | ✓ | ✓ | - |
| Namespace with URI-safe chars | ✓ | - | - |
| Key listing | ✓ | ✓ | - |
| Namespace enumeration | ✓ | ✓ | - |
| Bulk get operations | ✓ | ✓ | - |
| Bulk set operations | ✓ | ✓ | - |
| Full KV dump | ✓ | ✓ | - |
| Colon-separated keys | ✓ | ✓ | - |
| CORS preflight | - | - | ✓ |

### Blob Operations

| Test | Gateway | Self-Hosted | Browser |
|------|---------|-------------|---------|
| Presigned upload URL (private) | ✓ | ✓ | ✓ |
| Presigned upload URL (public) | ✓ | - | - |
| Upload via presigned URL | - | ✓ | ✓ |
| Private blob download | ✓ | - | - |
| Public blob custom domain | ✓ | - | - |
| 404 for missing blobs | ✓ | ✓ | - |
| Blob listing | ✓ | ✓ | - |
| Blob deletion | ✓ | ✓ | - |
| Special characters in keys | ✓ | ✓ | - |
| Invalid token rejection | - | ✓ | - |
| Wrong content length rejection | - | ✓ | - |

### SDK Frame Operations

| Test | Coverage |
|------|----------|
| Connection establishment | ✓ |
| Request capabilities flow | ✓ |
| KV get without permission | ✓ |
| Permission granting (read) | ✓ |
| Permission granting (write) | ✓ |
| Permission granting (delete) | ✓ |
| KV operations with permissions | ✓ |
| Permission clearing | ✓ |

## Data Isolation Strategies

### KV Clearing (Cloudflare)

```typescript
// test/gateway-test/e2e.test.ts:13-17
beforeEach(async () => {
  const list = await env.KV.list();
  await Promise.all(list.keys.map(k => env.KV.delete(k.name)));
});
```

### Unique Namespaces (Deno)

```typescript
// test/self-test/setup.ts:87-89
export function uniqueNamespace(prefix = 'test'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
```

### Principal Caching

```typescript
// test/self-test/setup.ts:19-56
let cachedAdminKey: string | null = null;

export async function getOrCreateAdminKey(): Promise<string> {
  if (cachedAdminKey) return cachedAdminKey;

  // Attempt creation or use existing
  const envKey = Deno.env.get('TEST_API_KEY');
  if (envKey) {
    cachedAdminKey = envKey;
    return envKey;
  }

  // Bootstrap creation
  const response = await testFetch('/principal/create', { ... });
  cachedAdminKey = data.secret;
  return data.secret;
}
```

## Test Configuration

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| TEST_BASE_URL | Self-hosted gateway URL | `http://localhost:3000` |
| BOOTSTRAP_API_KEY | Bootstrap key for tests | `testbootstrapkey123` |
| TEST_API_KEY | Pre-existing principal key | - |
| CI | CI environment flag | - |

### Playwright Web Servers

```typescript
webServer: [
  {
    command: 'cd ../../apps/self && deno task start',
    url: 'http://localhost:3000/openapi',
    env: {
      BOOTSTRAP_API_KEY: 'test-bootstrap-key-for-e2e',
      BLOB_STORAGE: 'filesystem',
      BLOB_PATH: './data/blobs',
      CORS_ORIGIN: '*'
    }
  },
  {
    command: 'cd ../../apps/org && pnpm dev',
    url: 'http://localhost:4321'
  },
  {
    command: 'cd ../../apps/demo && pnpm dev',
    url: 'http://localhost:5174'
  }
]
```

## Coverage Gaps

### Missing Unit Tests

| Area | Impact | Priority |
|------|--------|----------|
| Auth validation functions | Debugging difficulty | Medium |
| Token parsing | Edge case coverage | High |
| Namespace hashing | Security validation | High |
| HMAC signing | Crypto verification | High |

### Missing Integration Tests

| Area | Impact | Priority |
|------|--------|----------|
| Token refresh/expiration | Runtime failures | High |
| Rate limiting | DoS vulnerability | Medium |
| Concurrent operations | Race conditions | High |
| Large file handling | Memory issues | Medium |

### Missing E2E Tests

| Area | Impact | Priority |
|------|--------|----------|
| Permission denial recovery | UX issues | Medium |
| Network error handling | Reliability | Medium |
| Multiple frame instances | Conflicts | Low |
| Cross-browser testing | Compatibility | Low |

## Reliability Concerns

### Flaky Test Indicators

1. **Deno Sanitization Disabled**
   ```typescript
   sanitizeOps: false,
   sanitizeResources: false
   ```
   - Suggests resource cleanup issues
   - May cause test interference

2. **Silent Setup Failures**
   ```typescript
   test.beforeAll(async () => {
     try {
       principalApiKey = await createPrincipal();
     } catch (e) {
       console.warn('Could not create principal:', e);
       // Tests continue with undefined key
     }
   });
   ```

3. **Global State Dependencies**
   - Cached admin key shared across tests
   - First failure cascades to all tests

4. **Fixed Timeouts**
   - Playwright: 60s timeout
   - Random waits in browser tests (3s)

## Running Tests

### Cloudflare Gateway Tests

```bash
cd apps/gateway
pnpm test
# Uses vitest with cloudflare:test pool
```

### Self-Hosted Tests

```bash
# Start gateway first
cd apps/self
deno task dev

# Run tests
cd test/self-test
deno task test
```

### Playwright E2E Tests

```bash
cd test/self-test/e2e-browser
# Auto-starts all required servers
pnpm exec playwright test
```

### SDK Frame Tests

```bash
cd test/org-tests
pnpm dev
# Open http://localhost:5174 in browser
# Manual test execution
```

## Recommendations

### Priority 1: Add Unit Tests

1. Token parsing and validation
2. HMAC signature verification
3. Namespace hash generation
4. Auth header validation

### Priority 2: Fix Reliability

5. Enable Deno sanitization with proper cleanup
6. Add explicit error handling in setup
7. Isolate tests from global state
8. Add timeout configuration

### Priority 3: Expand Coverage

9. Add concurrency tests
10. Add token expiration tests
11. Add network failure scenarios
12. Add large file handling tests

### Priority 4: CI/CD Integration

13. Create GitHub Actions workflow
14. Add test coverage reporting
15. Add test result artifacts
16. Configure parallel test execution

## Test Metrics

### Current State

| Metric | Value |
|--------|-------|
| Total Tests | ~78 |
| Unit Tests | 0% |
| Integration Tests | 96% |
| E2E Tests | 4% |
| Coverage (estimated) | ~60% |
| Test Reliability | Medium |

### Target State

| Metric | Target |
|--------|--------|
| Total Tests | 150+ |
| Unit Tests | 30% |
| Integration Tests | 50% |
| E2E Tests | 20% |
| Coverage | 80%+ |
| Test Reliability | High |

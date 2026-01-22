# ORG-L01 through L03: Org App Polish Issues

## Issue Summary
- **Severity**: LOW
- **Files**: Various in `apps/org/`

---

## Issues

### ORG-L01: Hardcoded test origins in production code
- **File**: `apps/org/src/components/FrameEnforcer.svelte` (lines 137-138)
- **Description**: Development test origins hardcoded

**Current**:
```typescript
const testOrigins = ['http://localhost:5173', 'http://localhost:5174'];
```

**Fix**:
```typescript
const testOrigins = import.meta.env.DEV
  ? ['http://localhost:5173', 'http://localhost:5174']
  : [];
```

### ORG-L02: Missing CSRF/CSP headers
- **Files**: `apps/org/src/layouts/Layout.astro`, `apps/org/astro.config.mjs`
- **Description**: No visible security headers configuration

**Fix**: Add security headers in Astro config or middleware.

```typescript
// astro.config.mjs
export default defineConfig({
  server: {
    headers: {
      'Content-Security-Policy': "default-src 'self'; frame-ancestors 'self' https://*.federise.org",
      'X-Frame-Options': 'SAMEORIGIN',
      'X-Content-Type-Options': 'nosniff',
    }
  }
});
```

### ORG-L03: Unvalidated channel share permissions
- **File**: `apps/org/src/lib/channel-storage.ts` (lines 166-193)
- **Description**: Permission strings cast without runtime validation

**Fix**: Add runtime validation (related to ORG-H03).

---

## Testing Checklist

### ORG-L01 Tests
- [ ] Test origins only in dev mode
- [ ] Production build excludes test origins

### ORG-L02 Tests
- [ ] Security headers present
- [ ] CSP doesn't break functionality
- [ ] Frame embedding works where expected

### ORG-L03 Tests
- [ ] Invalid permissions rejected
- [ ] Valid permissions work

---

## Notes
- L02 (security headers) is worth prioritizing
- Others are polish items

# GW-L01 & GW-L02: Gateway Polish Issues

## Issue Summary
- **Severity**: LOW
- **Files**: Various gateway files

---

## Issues

### GW-L01: Legacy namespace aliasing
- **File**: `packages/gateway-core/src/endpoints/blob/get.ts` (line 68)
- **Description**: Backwards compatibility with namespace aliasing system

**Action**: Remove when doing broader backwards compat cleanup (SDK-H01).

### GW-L02: Bootstrap API key printed to console
- **File**: `apps/self/src/main.ts` (lines 159-164)
- **Description**: Bootstrap key logged to server console

**Current**:
```typescript
console.log(`Bootstrap API Key: ${bootstrapKey}`);
```

**Fix Options**:
1. Write to secure file instead
2. Display only once and clear
3. Require environment variable

```typescript
// Option: Write to file
import { writeFileSync } from 'fs';
writeFileSync('.bootstrap-key', bootstrapKey, { mode: 0o600 });
console.log('Bootstrap key written to .bootstrap-key');

// Option: Environment variable
const bootstrapKey = process.env.BOOTSTRAP_KEY || generateBootstrapKey();
if (!process.env.BOOTSTRAP_KEY) {
  console.warn('No BOOTSTRAP_KEY set, generated temporary key');
}
```

---

## Testing Checklist

### GW-L01 Tests
- [ ] Namespace aliasing removed after cleanup

### GW-L02 Tests
- [ ] Bootstrap key not in plain console output
- [ ] Key still accessible for setup
- [ ] Key file has correct permissions

---

## Notes
- GW-L01 depends on SDK-H01
- GW-L02 is a quick security improvement

# SDK-L01: Index file could be cleaner

## Issue Summary
- **Severity**: LOW
- **File**: `packages/sdk/src/index.ts`
- **Description**: Index file organization could be improved

---

## Possible Improvements

1. **Group exports by category**
```typescript
// Client exports
export { FederiseClient } from './client';
export type { ClientOptions } from './client';

// Channel exports
export { ChannelClient } from './channel-client';
export type { Channel, CreateChannelOptions } from './types';

// Type exports
export type { ... } from './types';
```

2. **Remove deprecated exports**
See SDK-H01 for backwards compatibility removal.

3. **Add barrel exports**
Organize by feature area.

---

## Testing Checklist
- [ ] All public APIs still exported
- [ ] TypeScript compilation succeeds
- [ ] Consumers can import correctly

---

## Notes
- Low priority polish
- Do after major refactors

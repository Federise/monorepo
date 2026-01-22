# GW-H04: Channel operations lack authorization for API key auth

## Issue Summary
- **Severity**: HIGH
- **File**: `packages/gateway-core/src/endpoints/channel/read.ts` (lines 42-73)
- **Guideline Violated**: "Principle of least privilege"

## Description
When using API key auth (not token), no ownership check is performed. Any authenticated user can access any channel.

## Impact
- Cross-tenant data access
- Privacy violation
- Complete channel isolation failure

---

## Current State Analysis

### What to Test Before Changes
- [ ] Review channel read endpoint
- [ ] Test if user A can read user B's channel
- [ ] Understand API key vs token auth differences
- [ ] Document authorization logic

### Commands to Test Current State
```bash
# Review channel read
cat packages/gateway-core/src/endpoints/channel/read.ts

# Check auth middleware
grep -rn "auth" packages/gateway-core/src/middleware/

# Find authorization patterns
grep -rn "owner\|authorize\|permission" packages/gateway-core/src/endpoints/channel/
```

---

## Authentication vs Authorization

**Authentication**: Verifying identity (API key proves who you are)
**Authorization**: Checking permissions (can you access this resource?)

Current issue: Authentication exists, authorization is missing for API key auth.

---

## Possible Approaches

### Approach A: Add Ownership Check (Recommended)
**Description**: Check if authenticated identity owns the channel before allowing access.

**Pros**:
- Simple fix
- Clear ownership model

**Cons**:
- Need to track channel ownership

**Effort**: Low-Medium

### Approach B: Capability-Based Access
**Description**: Require specific capability grant for channel access.

**Pros**:
- Fine-grained control
- Supports sharing

**Cons**:
- More complex
- Requires capability tracking

**Effort**: Medium

---

## Recommended Approach

**Approach A: Add Ownership Check**

Simple and effective: verify the authenticated identity owns or has been granted access to the channel.

---

## Implementation Plan

### Step 1: Understand Channel Ownership
1. How is channel ownership stored?
2. Is there a creator/owner field?
3. How do shared channels work?

### Step 2: Create Authorization Check
```typescript
async function authorizeChannelAccess(
  ctx: Context,
  channelId: string
): Promise<boolean> {
  const identity = ctx.state.identity;
  const channel = await getChannel(ctx, channelId);

  if (!channel) return false;

  // Owner can access
  if (channel.ownerId === identity.id) return true;

  // Check for share grants
  const grants = await getChannelGrants(ctx, channelId);
  if (grants.some(g => g.identityId === identity.id)) return true;

  return false;
}
```

### Step 3: Apply to Channel Read
```typescript
export async function handleChannelRead(ctx: Context) {
  const { channelId } = ctx.params;

  // Add authorization check
  if (!await authorizeChannelAccess(ctx, channelId)) {
    return new Response('Unauthorized', { status: 403 });
  }

  // Proceed with read...
}
```

### Step 4: Apply to All Channel Operations
1. Channel read
2. Channel update
3. Channel delete
4. Channel message operations

### Step 5: Update Tests
1. Test owner can access
2. Test non-owner cannot access
3. Test shared access works
4. Test with API key and token auth

---

## Testing Checklist

### Pre-Implementation Tests (Current State)
- [ ] User A creates channel
- [ ] User B tries to read it with API key
- [ ] Document if this succeeds (it shouldn't)

### Implementation Tests
- [ ] Authorization check works
- [ ] Owner can access channel
- [ ] Non-owner gets 403
- [ ] Share grants allow access

### Post-Implementation Tests (New State)
- [ ] Only authorized users can read channels
- [ ] Works with API key auth
- [ ] Works with token auth
- [ ] Proper error responses

### Regression Tests
- [ ] Owners can still access their channels
- [ ] Token-based access works
- [ ] Shared channels work
- [ ] Channel operations work

---

## Authorization Matrix

| Auth Type | Owned | Shared | Public | Other |
|-----------|-------|--------|--------|-------|
| API Key | ✅ | ✅ | ✅ | ❌ |
| Token | ✅ | ✅ | ✅ | ❌ |
| None | ❌ | ❌ | ✅ | ❌ |

---

## Related Issues
- GW-001: KV/blob namespace ownership validation
- GW-H08: Identity list exposes all identities

---

## Notes
- Consider caching channel ownership for performance
- Think about channel visibility levels
- Document authorization model

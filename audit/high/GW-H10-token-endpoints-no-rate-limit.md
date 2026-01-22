# GW-H10: Token lookup/claim endpoints have no rate limiting

## Issue Summary
- **Severity**: HIGH
- **File**: `packages/gateway-core/src/middleware/auth.ts` (lines 35-45)
- **Guideline Violated**: "All external input must be validated"

## Description
Public endpoints allow unauthenticated brute-force attacks on token lookup and claim endpoints.

## Impact
- Token enumeration
- Brute force attacks
- Unauthorized access
- Resource exhaustion

---

## Current State Analysis

### What to Test Before Changes
- [ ] Review token lookup endpoint
- [ ] Review token claim endpoint
- [ ] Test rapid requests
- [ ] Check if any rate limiting exists

### Commands to Test Current State
```bash
# Find token endpoints
grep -rn "token.*lookup\|lookup.*token" packages/gateway-core/src/

# Check for rate limiting
grep -rn "rate\|limit\|throttle" packages/gateway-core/src/
```

---

## Attack Scenarios

### Token Enumeration
```bash
# Attacker tries many tokens
for token in {a..z}{a..z}{a..z}{a..z}; do
  curl "https://gateway/token/lookup/$token"
done
```

### Claim Brute Force
```bash
# Attacker tries to claim tokens
for token in $POSSIBLE_TOKENS; do
  curl -X POST "https://gateway/token/claim" -d "{\"token\": \"$token\"}"
done
```

---

## Possible Approaches

### Approach A: Strict Rate Limiting (Recommended)
**Description**: Very aggressive rate limiting on token endpoints.

**Pros**:
- Prevents brute force
- Simple implementation

**Cons**:
- May affect legitimate use

**Effort**: Medium

### Approach B: Token Complexity + Rate Limit
**Description**: Ensure tokens are complex AND rate limit.

**Pros**:
- Defense in depth

**Cons**:
- More implementation work

**Effort**: Medium-High

---

## Recommended Approach

**Approach A + B: Both**

Rate limit aggressively AND ensure tokens are cryptographically strong.

---

## Implementation Plan

### Step 1: Add Aggressive Rate Limits
```typescript
// Token lookup: 10 requests per minute per IP
// Token claim: 5 requests per minute per IP
const tokenRateLimits = {
  lookup: { requests: 10, windowMs: 60000 },
  claim: { requests: 5, windowMs: 60000 },
};
```

### Step 2: Apply Rate Limiting
```typescript
export async function handleTokenLookup(ctx: Context) {
  const ip = ctx.request.headers.get('CF-Connecting-IP');

  const limited = await checkRateLimit(ctx, `token:lookup:${ip}`, {
    max: 10,
    windowMs: 60000
  });

  if (limited) {
    return new Response('Too Many Requests', { status: 429 });
  }

  // Proceed...
}
```

### Step 3: Add Failed Attempt Tracking
```typescript
// Extra penalty for failed lookups
async function handleTokenLookup(ctx: Context) {
  // ... lookup ...

  if (!found) {
    await incrementFailedAttempts(ctx, ip);

    // Block IP after too many failures
    const failures = await getFailedAttempts(ctx, ip);
    if (failures > 50) {
      await blockIp(ctx, ip, 3600000); // 1 hour
    }
  }
}
```

### Step 4: Verify Token Entropy
1. Check token generation uses CSPRNG
2. Ensure sufficient length (128+ bits)
3. No predictable patterns

---

## Testing Checklist

### Pre-Implementation Tests (Current State)
- [ ] Rapid token lookups succeed
- [ ] No rate limiting observed
- [ ] Document baseline

### Implementation Tests
- [ ] Rate limiting triggers at threshold
- [ ] 429 returned when exceeded
- [ ] Failed attempts tracked

### Post-Implementation Tests (New State)
- [ ] Brute force blocked
- [ ] Normal use works
- [ ] Recovery after window

### Regression Tests
- [ ] Token lookup works
- [ ] Token claim works
- [ ] Share links work

---

## Token Security Requirements

```typescript
// Token generation should use:
import { randomBytes } from 'crypto';

function generateToken(): string {
  // 32 bytes = 256 bits of entropy
  return randomBytes(32).toString('base64url');
}

// Resulting token: ~43 characters, ~2^256 possible values
// Even at 1M attempts/second, would take heat death of universe
```

---

## Related Issues
- GW-H02: No rate limiting on any endpoint

---

## Notes
- Prioritize public endpoints
- Consider CAPTCHA for repeated failures
- Monitor for attack patterns
- Add alerting for rate limit violations

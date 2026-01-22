# GW-H02: No rate limiting on any endpoint

## Issue Summary
- **Severity**: HIGH
- **Files**: All endpoints in `packages/gateway-core/`
- **Guideline Violated**: "Capability-Based Sandboxing"

## Description
No rate limiting implemented on API endpoints. This allows abuse, DoS attacks, and resource exhaustion.

## Impact
- Denial of service vulnerability
- Resource exhaustion
- Abuse potential
- Cost amplification attacks

---

## Current State Analysis

### What to Test Before Changes
- [ ] Verify no rate limiting exists
- [ ] Test rapid requests to endpoints
- [ ] Check if any middleware limits exist
- [ ] Understand Cloudflare Workers limits

### Commands to Test Current State
```bash
# Search for rate limit code
grep -rn "rate\|limit\|throttle" packages/gateway-core/src/

# Check middleware
ls packages/gateway-core/src/middleware/

# Look for any existing limiting
grep -rn "429\|too many" packages/gateway-core/src/
```

---

## Possible Approaches

### Approach A: Token Bucket Rate Limiter (Recommended)
**Description**: Implement per-identity token bucket rate limiting using KV storage.

**Pros**:
- Standard algorithm
- Smooth rate limiting
- Allows bursts

**Cons**:
- KV storage for state
- Latency for checks

**Effort**: Medium

### Approach B: Fixed Window Rate Limiter
**Description**: Count requests per fixed time window.

**Pros**:
- Simple implementation
- Easy to understand

**Cons**:
- Burst at window edges
- Less smooth

**Effort**: Low-Medium

### Approach C: Cloudflare Rate Limiting
**Description**: Use Cloudflare's built-in rate limiting.

**Pros**:
- Edge-based
- No code needed
- Handles DDoS

**Cons**:
- Less granular control
- Configuration complexity
- Cost

**Effort**: Low

---

## Recommended Approach

**Approach A (Token Bucket) + Approach C (Cloudflare)**

Use Cloudflare for edge-level DDoS protection and token bucket for per-identity, per-endpoint rate limiting.

---

## Implementation Plan

### Step 1: Define Rate Limits
| Endpoint Category | Requests/Min | Burst |
|-------------------|--------------|-------|
| Read operations | 100 | 20 |
| Write operations | 30 | 10 |
| Auth endpoints | 10 | 5 |
| Public endpoints | 20 | 5 |

### Step 2: Create Rate Limiter Middleware
```typescript
// packages/gateway-core/src/middleware/rate-limiter.ts

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  keyGenerator: (ctx: Context) => string;
}

export async function rateLimit(
  ctx: Context,
  config: RateLimitConfig
): Promise<Response | null> {
  const key = config.keyGenerator(ctx);
  const current = await ctx.kv.get(`rate:${key}`);

  // Check and update...

  if (exceeded) {
    return new Response('Too Many Requests', {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(config.maxRequests),
        'X-RateLimit-Remaining': '0',
      }
    });
  }

  return null; // Continue
}
```

### Step 3: Apply to Endpoints
1. Add to auth endpoints (strictest)
2. Add to write endpoints
3. Add to read endpoints
4. Add to public endpoints

### Step 4: Add Response Headers
1. X-RateLimit-Limit
2. X-RateLimit-Remaining
3. X-RateLimit-Reset
4. Retry-After (on 429)

### Step 5: Configure Cloudflare
1. Enable Cloudflare rate limiting rules
2. Set DDoS protection
3. Configure by endpoint pattern

---

## Testing Checklist

### Pre-Implementation Tests (Current State)
- [ ] Rapid fire requests don't get blocked
- [ ] No 429 responses ever
- [ ] Measure baseline throughput

### Implementation Tests
- [ ] Rate limiter blocks excess requests
- [ ] 429 response returned correctly
- [ ] Headers are present
- [ ] Retry-After is correct

### Post-Implementation Tests (New State)
- [ ] Normal usage works
- [ ] Excessive requests blocked
- [ ] Different limits per endpoint
- [ ] Recovery after window

### Regression Tests
- [ ] Normal API usage works
- [ ] Authenticated requests work
- [ ] Multi-tenant isolation
- [ ] No false positives

---

## Rate Limit Keys

```typescript
// Per-identity limiting
const identityKey = (ctx) => `identity:${ctx.state.identity?.id}`;

// Per-IP limiting (for unauthenticated)
const ipKey = (ctx) => `ip:${ctx.request.headers.get('CF-Connecting-IP')}`;

// Per-endpoint limiting
const endpointKey = (ctx) => `endpoint:${ctx.state.identity?.id}:${ctx.url.pathname}`;
```

---

## Related Issues
- GW-H10: Token lookup/claim endpoints have no rate limiting
- GW-H03: Missing input validation

---

## Notes
- Consider different limits for different plans
- Monitor and adjust limits based on usage
- Add alerting for rate limit violations
- Document rate limits in API docs

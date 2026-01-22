# GW-M01 through M08: Gateway Code Quality Issues

## Issue Summary
- **Severity**: MEDIUM
- **Files**: Various in `packages/gateway-core/src/endpoints/`
- **Guideline Violated**: "Follow existing patterns"

---

## Issues

### GW-M01-M05: Inconsistent Response Formats
Different endpoints return errors and success in different formats.

**Current State**:
```typescript
// Endpoint A
return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });

// Endpoint B
return new Response('Not found', { status: 404 });

// Endpoint C
return Response.json({ success: false, message: 'Not found' });
```

**Standard Format**:
```typescript
// Error responses
interface ErrorResponse {
  error: string;
  message?: string;
  details?: unknown;
}

// Success responses
interface SuccessResponse<T> {
  success: true;
  data: T;
}
```

### GW-M06: Short link redirect lacks origin validation
- **File**: `packages/gateway-core/src/endpoints/shortlink/resolve.ts` (lines 11-21)
- **Description**: Redirect target not validated for javascript: or data: URIs

**Fix**:
```typescript
function validateRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const dangerous = ['javascript:', 'data:', 'vbscript:', 'file:'];
    return !dangerous.includes(parsed.protocol);
  } catch {
    return false;
  }
}
```

### GW-M07: Channel token uses shared secret
- **File**: `packages/gateway-core/src/endpoints/channel/token-routes.ts` (lines 45-46)
- **Description**: All tokens for a channel use same `meta.secret` for HMAC

**Risk**: If one token leaked, others could be computed.

**Fix**: Use unique secret per token, or token-specific salt.

### GW-M08: No input length limits on string fields
- **File**: Various endpoints
- **Description**: Many endpoints lack max length limits

**Fix**:
```typescript
const CreateChannelSchema = z.object({
  name: z.string().min(1).max(100),      // Add max
  description: z.string().max(1000),      // Add max
});
```

---

## Implementation Plan

### Step 1: Define Response Standards
Create shared response utilities:
```typescript
// packages/gateway-core/src/utils/response.ts
export function errorResponse(status: number, error: string, details?: unknown) {
  return Response.json({ error, details }, { status });
}

export function successResponse<T>(data: T) {
  return Response.json({ success: true, data });
}
```

### Step 2: Apply Response Standards
Update all endpoints to use standard utilities.

### Step 3: Add URL Validation
Add redirect validation to shortlink endpoint.

### Step 4: Fix Channel Tokens
Implement per-token secrets.

### Step 5: Add Length Limits
Update all schemas with appropriate max lengths.

---

## Testing Checklist

### Response Format Tests
- [ ] All error responses have consistent format
- [ ] All success responses have consistent format
- [ ] HTTP status codes are correct

### URL Validation Tests
- [ ] javascript: URLs blocked
- [ ] data: URLs blocked
- [ ] Valid HTTP URLs work

### Token Tests
- [ ] Tokens can't be derived from each other
- [ ] Each token has unique verification

### Length Limit Tests
- [ ] Oversized input rejected
- [ ] Max length limits documented

---

## Notes
- Response standardization affects all clients
- Test thoroughly
- Update API documentation

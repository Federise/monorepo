# GW-H03: Missing input validation on various endpoints

## Issue Summary
- **Severity**: HIGH
- **Files**: Various in `packages/gateway-core/src/endpoints/`
- **Guideline Violated**: "All external input must be validated"

## Description
Some endpoints accept input without thorough validation. This creates security vulnerabilities and potential for unexpected behavior.

## Impact
- Injection attacks possible
- Data corruption
- Server errors from malformed input
- Security bypasses

---

## Current State Analysis

### What to Test Before Changes
- [ ] Audit each endpoint for validation
- [ ] Test with malformed inputs
- [ ] Document validation gaps
- [ ] Check for Zod usage

### Commands to Test Current State
```bash
# Find validation code
grep -rn "zod\|validate\|schema" packages/gateway-core/src/

# Find endpoints without validation
find packages/gateway-core/src/endpoints -name "*.ts" -exec grep -L "schema\|validate" {} \;

# Check request body parsing
grep -rn "request.json\|body" packages/gateway-core/src/endpoints/
```

---

## Input Validation Requirements

### Every Endpoint Should Validate:
1. **Request body** - Schema, types, required fields
2. **URL parameters** - Format, existence
3. **Query parameters** - Types, ranges
4. **Headers** - Required headers, format

---

## Possible Approaches

### Approach A: Zod Schema for All Endpoints (Recommended)
**Description**: Define Zod schemas for every endpoint, validate all input.

**Pros**:
- Consistent validation
- Type safety
- Clear error messages

**Cons**:
- Schema maintenance
- Runtime overhead

**Effort**: Medium-High

### Approach B: Validation Middleware
**Description**: Create middleware that handles common validation patterns.

**Pros**:
- DRY validation
- Consistent error handling

**Cons**:
- Less endpoint-specific control

**Effort**: Medium

---

## Recommended Approach

**Approach A: Zod Schema for All Endpoints**

Define request schemas for every endpoint using Zod. Validate all input before processing.

---

## Implementation Plan

### Step 1: Audit All Endpoints
Create inventory of validation status:

| Endpoint | Has Validation | Needs |
|----------|---------------|-------|
| `/channel/create` | Partial | Full schema |
| `/kv/set` | None | Key/value validation |
| ... | ... | ... |

### Step 2: Define Common Schemas
```typescript
// packages/gateway-core/src/schemas/common.ts
import { z } from 'zod';

export const IdentityIdSchema = z.string().min(1).max(100);
export const NamespaceSchema = z.string().min(1).max(200).regex(/^[a-zA-Z0-9_:-]+$/);
export const KeySchema = z.string().min(1).max(500);
export const UrlSchema = z.string().url();
```

### Step 3: Define Per-Endpoint Schemas
```typescript
// packages/gateway-core/src/endpoints/channel/create.ts
import { z } from 'zod';

const CreateChannelSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  visibility: z.enum(['public', 'private', 'unlisted']).default('private'),
});

export async function handleCreateChannel(ctx: Context) {
  const body = await ctx.req.json();
  const input = CreateChannelSchema.parse(body);
  // Process validated input...
}
```

### Step 4: Add Validation to Each Endpoint
1. Channel endpoints
2. KV endpoints
3. Blob endpoints
4. Identity endpoints
5. Token endpoints
6. Shortlink endpoints

### Step 5: Create Validation Error Handler
```typescript
// Consistent error response for validation failures
function handleValidationError(error: ZodError): Response {
  return new Response(JSON.stringify({
    error: 'Validation Error',
    details: error.errors.map(e => ({
      path: e.path.join('.'),
      message: e.message
    }))
  }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

---

## Testing Checklist

### Pre-Implementation Tests (Current State)
- [ ] Document which endpoints have validation
- [ ] Test endpoints with invalid input
- [ ] Document error responses

### Implementation Tests
- [ ] Each schema validates correctly
- [ ] Invalid input returns 400
- [ ] Error messages are clear
- [ ] Valid input passes

### Post-Implementation Tests (New State)
- [ ] All endpoints validate input
- [ ] Consistent error format
- [ ] No unvalidated paths

### Regression Tests
- [ ] Valid requests work
- [ ] Existing clients work
- [ ] Error handling unchanged
- [ ] Performance acceptable

---

## Validation Checklist by Endpoint

### Channel Endpoints
- [ ] POST /channel/create - body schema
- [ ] GET /channel/:id - id format
- [ ] PUT /channel/:id - body + id
- [ ] DELETE /channel/:id - id format
- [ ] POST /channel/:id/message - body schema

### KV Endpoints
- [ ] GET /kv/:namespace/:key - namespace + key format
- [ ] PUT /kv/:namespace/:key - body + namespace + key
- [ ] DELETE /kv/:namespace/:key - namespace + key
- [ ] GET /kv/:namespace - namespace format

### Blob Endpoints
- [ ] POST /blob/upload - metadata + file
- [ ] GET /blob/:namespace/:key - params
- [ ] DELETE /blob/:namespace/:key - params
- [ ] GET /blob/:namespace - namespace format

### Identity Endpoints
- [ ] POST /identity/create - body schema
- [ ] GET /identity/:id - id format
- [ ] DELETE /identity/:id - id format
- [ ] POST /identity/register-app - body schema

### Token Endpoints
- [ ] POST /token/create - body schema
- [ ] POST /token/claim - body schema
- [ ] GET /token/lookup/:token - token format

---

## Related Issues
- GW-H05: Unvalidated namespace parameter
- SDK-003: Token parsing validation
- ORG-H03: Missing capability string validation

---

## Notes
- Use Zod's `.safeParse()` for error handling
- Consider validation performance for hot paths
- Document validation rules in API docs
- Add validation to request logging

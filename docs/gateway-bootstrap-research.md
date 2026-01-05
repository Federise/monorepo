# Research: Self-Bootstrapping Gateway

**Date:** 2025-12-30

## Current Gateway Dependencies

Based on exploring the codebase, the gateway needs:

| Resource | Count | Details |
|----------|-------|---------|
| KV Namespace | 1 | Stores principals, blob metadata |
| R2 Bucket | 2 | `federise-objects` (private), `federise-objects-public` (public) |
| CORS Config | Required | For presigned URL uploads |
| R2 API Token | Optional | For presigned URL feature |

## Cloudflare API Capabilities

All these operations are available via REST API:

```
POST /accounts/{account_id}/storage/kv/namespaces     # Create KV
POST /accounts/{account_id}/r2/buckets                # Create R2 bucket
PUT  /accounts/{account_id}/r2/buckets/{name}/cors    # Set CORS
PUT  /accounts/{account_id}/workers/scripts/{name}/settings  # Update worker bindings
```

## The Core Challenge: Chicken-and-Egg Problem

A worker **cannot use** bindings until they're configured. But to configure them via API from within the worker, the worker needs to:

1. Create KV namespace → get the namespace ID
2. Create R2 buckets
3. **Update its own deployment** with the new binding IDs
4. Restart to pick up the new configuration

This is possible - the worker can call `PUT /accounts/{account_id}/workers/scripts/{script_name}/settings` to modify its own bindings - but it introduces complexity.

---

## Three Approaches Compared

### Option A: Full Self-Bootstrap (Worker does everything)

**How it works:**
1. Deploy a "bootstrap mode" worker with just an API token secret
2. User hits `/bootstrap` endpoint
3. Worker creates KV namespace, R2 buckets, sets CORS
4. Worker calls CF API to update its own bindings
5. Worker restarts and is now fully functional

**Pros:**
- Single deployment, one command for user
- All configuration handled automatically

**Cons:**
- Worker needs powerful permissions (edit itself + create resources)
- Security risk: self-modifying code with account-level access
- User still must create an API token with correct permissions
- Complex error handling and rollback logic
- If something goes wrong, harder to debug

**Required Token Permissions:**
- `Account.Workers Scripts:Edit`
- `Account.Workers KV Storage:Edit`
- `Account.Workers R2 Storage:Edit`

### Option B: Wrangler Auto-Provisioning (New in Oct 2025)

**How it works:**
```jsonc
// wrangler.jsonc - just declare resources without IDs
{
  "kv_namespaces": [{ "binding": "KV" }],  // No ID needed!
  "r2_buckets": [
    { "binding": "R2" },  // No bucket_name needed!
    { "binding": "R2_PUBLIC" }
  ]
}
```
```bash
wrangler deploy  # Auto-creates resources
```

**Pros:**
- Officially supported by Cloudflare
- Simple - just `wrangler deploy`
- No extra permissions needed beyond deploy

**Cons:**
- **Does NOT set CORS** - still manual step needed
- Doesn't generate R2 API credentials for presigned URLs
- User still needs to understand what's happening

### Option C: Hybrid (Recommended)

**How it works:**
1. Use Wrangler auto-provisioning for KV/R2 creation
2. Add a `/admin/setup` endpoint in the gateway that:
   - Requires the bootstrap API key
   - Calls CF API to configure CORS on buckets
   - Optionally creates R2 API token for presigned URLs
   - Only needs limited permissions (just R2 CORS + token creation)

**Pros:**
- Leverages built-in Wrangler features
- Self-bootstrap only handles what Wrangler can't (CORS)
- Smaller permission surface
- Clearer separation of concerns

**Cons:**
- Still requires an API token for CORS setup
- Two-step process (deploy + setup call)

---

## Assessment: Is Self-Bootstrap Simpler for a Layman?

**Short answer: Probably not, but Option C could help.**

### Why full self-bootstrap (Option A) isn't simpler:

1. **Token creation is the hard part** - Users still need to navigate the Cloudflare dashboard to create an API token with specific permissions. This is arguably harder than just clicking "Create KV Namespace" and "Create R2 Bucket"

2. **More can go wrong** - Self-modifying workers are complex. If bootstrap fails midway, users are stuck in a broken state

3. **Security concerns** - Giving a worker the ability to modify itself is a significant permission

4. **Debugging is harder** - When things fail, "my worker tried to update itself but failed" is harder to troubleshoot than "I need to create a KV namespace"

### What actually helps laypeople:

1. **Good documentation** - Step-by-step guide with screenshots
2. **CLI tool** - A `federise setup` command that wraps wrangler + API calls
3. **Validation endpoint** - `/admin/check-setup` that reports what's missing
4. **Wrangler auto-provisioning** - Already handles 80% of the problem

---

## Recommended Approach

**Use Option C (Hybrid) with good tooling:**

```jsonc
// wrangler.jsonc - simplified
{
  "name": "federise-gateway",
  "kv_namespaces": [{ "binding": "KV" }],
  "r2_buckets": [
    { "binding": "R2" },
    { "binding": "R2_PUBLIC" }
  ],
  "vars": {
    "BOOTSTRAP_API_KEY": "..."
  }
}
```

Then add to the gateway:

```typescript
// POST /admin/setup - configure CORS and optional presigned URL support
app.post('/admin/setup', async (c) => {
  // Validate bootstrap key
  // Call CF API to set CORS on R2 buckets
  // Return success/instructions
});

// GET /admin/check - validate all dependencies
app.get('/admin/check', async (c) => {
  // Test KV binding
  // Test R2 bindings
  // Check CORS configuration
  // Return status report
});
```

**User experience:**
```bash
# 1. Clone and configure
cp wrangler.example.jsonc wrangler.jsonc
# Edit BOOTSTRAP_API_KEY

# 2. Deploy (auto-creates KV + R2)
wrangler deploy

# 3. Configure CORS (if using presigned URLs)
curl -X POST https://your-gateway/admin/setup \
  -H "Authorization: ApiKey YOUR_BOOTSTRAP_KEY" \
  -H "X-CF-API-Token: YOUR_TOKEN"
```

---

## Sources

- [Cloudflare R2 Buckets API](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/)
- [R2 CORS Configuration API](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/cors/methods/update/)
- [KV Namespaces API](https://developers.cloudflare.com/api/resources/kv/subresources/namespaces/)
- [Automatic Resource Provisioning Changelog](https://developers.cloudflare.com/changelog/2025-10-24-automatic-resource-provisioning/)
- [API Token Permissions](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)
- [Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Wrangler Configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)

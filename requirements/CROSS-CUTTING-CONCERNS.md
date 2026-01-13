# Cross-Cutting Concerns

This document covers security, performance, and cost considerations that span multiple components of the Federise platform.

## Table of Contents

1. [Security](#security)
2. [Performance](#performance)
3. [Cost Analysis](#cost-analysis)
4. [Known Issues & Bugs](#known-issues--bugs)
5. [Recommendations](#recommendations)

---

## Security

### Authentication Model

#### API Key Authentication

| Aspect | Implementation | Location |
|--------|----------------|----------|
| Generation | 32 random bytes → 64-char hex | `gateway-core/src/lib/crypto.ts:1-7` |
| Storage | SHA-256 hash only | `gateway-core/src/lib/crypto.ts:9-15` |
| Format | `Authorization: ApiKey {key}` | `gateway-core/src/middleware/auth.ts:31` |
| Validation | Regex + hash lookup | `gateway-core/src/middleware/auth.ts:32-77` |

**Security Strengths:**
- Keys never stored in plaintext (SHA-256 hashed)
- Cryptographically random generation
- Consistent header format validation

**Security Weaknesses:**
- No rate limiting on authentication attempts
- No API key rotation mechanism
- Bootstrap key in wrangler.json (version control exposure)
- Plain text transmission requires HTTPS

#### Capability Token Authentication

| Aspect | Implementation | Location |
|--------|----------------|----------|
| Algorithm | HMAC-SHA256 | `gateway-core/src/lib/log-token.ts` |
| Formats | V1 (JSON), V2 (binary), V3 (ultra-compact) | `gateway-core/src/lib/log-token.ts:6-16` |
| Expiration | Absolute Unix timestamp | `gateway-core/src/lib/log-token.ts:176` |
| Verification | Timing-safe comparison | `gateway-core/src/lib/log-token.ts:152,207,267` |

**Token Security Analysis:**
- HMAC prevents forgery without knowing log secret
- Timing-safe comparison prevents timing attacks
- No revocation mechanism (tokens valid until expiry)
- Token visible in URL fragments (referrer leakage possible)

### Authorization Model

#### Capability-Based Access Control

```
Capability Types:
├── kv:read      - Read KV values
├── kv:write     - Write KV values
├── kv:delete    - Delete KV values
├── blob:read    - Read blob metadata and content
├── blob:write   - Upload and modify blobs
├── log:create   - Create logs and append events
├── log:delete   - Delete logs
└── notifications - Receive notifications (reserved)
```

**Permission Flow:**
1. Application requests capabilities from Frame
2. Frame checks stored permissions for origin
3. If not granted: redirect to `/authorize` page
4. User approves in Org admin UI
5. Permissions stored in KV (`__ORG:permissions`)
6. Future requests allowed without re-approval

**Storage Location:** `apps/org/src/lib/permissions.ts:5-6`
```typescript
const PERMISSION_NAMESPACE = '__ORG';
const PERMISSION_KEY = 'permissions';
```

### Origin Isolation

All data is isolated by origin using SHA-256 namespace hashing:

```typescript
// apps/org/src/lib/kv-storage.ts:21-28
async function buildNamespace(origin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(origin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return `origin_${hashHex}`;
}
```

**Isolation Guarantees:**
- Each origin gets unique 64-char hex namespace
- Prevents cross-origin data access
- Consistent namespace for same origin across requests

### CORS Configuration

| Setting | Default | Risk Level |
|---------|---------|------------|
| origin | `"*"` | HIGH |
| methods | GET, POST, PUT, DELETE, OPTIONS | Medium |
| credentials | false | Low (good) |
| maxAge | 86400 (24h) | Low |

**Location:** `apps/gateway/src/index.ts:49-59`

**Recommendations:**
- Configure explicit origins in production
- Avoid `"*"` for production deployments
- Consider per-tenant CORS policies

### Cryptographic Implementation

| Algorithm | Usage | Location |
|-----------|-------|----------|
| SHA-256 | API key hashing, namespace generation | `gateway-core/src/lib/crypto.ts` |
| HMAC-SHA256 | Token signing, presigned URLs | `gateway-core/src/lib/hmac.ts`, `log-token.ts` |
| crypto.getRandomValues | Key generation | `gateway-core/src/lib/crypto.ts:2` |

**Implementation Quality:**
- Uses Web Crypto API (native, audited implementation)
- Timing-safe comparisons for signatures
- No custom crypto implementations

### Known Security Vulnerabilities

| ID | Severity | Component | Description |
|----|----------|-----------|-------------|
| SEC-001 | HIGH | apps/org | API keys stored unencrypted in localStorage |
| SEC-002 | HIGH | apps/org | Test endpoints may be accessible in production |
| SEC-003 | MEDIUM | apps/gateway | Bootstrap key exposed in wrangler.json |
| SEC-004 | MEDIUM | SDK | Tokens visible in URL fragments (referrer leakage) |
| SEC-005 | MEDIUM | All | No rate limiting on authentication endpoints |
| SEC-006 | LOW | gateway-core | SIGNING_SECRET defined but unused |

---

## Performance

### Request Latency Characteristics

#### Cloudflare Gateway

| Operation | Typical Latency | Bottleneck |
|-----------|-----------------|------------|
| KV Get | 15-30ms | KV lookup |
| KV Set | 20-50ms | KV write |
| KV List | 30-100ms | Key enumeration |
| Blob Upload (direct) | 50-200ms | R2 write |
| Blob Upload (presigned) | 10-20ms | URL generation |
| Log Append | 50-100ms | Durable Object coordination |
| Log Read | 30-80ms | DO storage query |
| SSE Poll | 1000ms interval | Fixed polling |

#### Self-Hosted Gateway

| Operation | Typical Latency | Bottleneck |
|-----------|-----------------|------------|
| KV Get | 1-5ms | SQLite lookup |
| KV Set | 2-10ms | SQLite write |
| Blob Upload (FS) | Variable | Disk I/O |
| Blob Upload (S3) | 50-200ms | Network + S3 API |

### Throughput Limits

#### Durable Object Log Bottleneck

**Problem:** Single DO instance per log serializes all appends
- Theoretical max: ~20 appends/second per log
- Location: `apps/gateway/src/durable-objects/log-storage.ts`

**Impact:** High-throughput logs will queue requests

**Mitigation Options:**
1. Log sharding (split logId into segments)
2. Client-side buffering
3. Batch append API

#### SSE Polling Overhead

**Problem:** 1-second polling interval creates constant load
- Location: `gateway-core/src/endpoints/log/subscribe.ts:55`
- 60+ requests/minute per active subscriber

**Impact:** High subscriber count = high request volume

**Mitigation Options:**
1. WebSocket instead of SSE polling
2. Server-push via DO notification
3. Adaptive polling intervals

### Memory Constraints

| Component | Limit | Concern |
|-----------|-------|---------|
| Workers | ~128MB | Large file handling |
| Deno | System RAM | Full file buffering |
| Browser SDK | ~4GB (browser limit) | Large ArrayBuffer |

**File Upload Memory Issues:**
- Self-hosted buffers entire file in memory before upload
- Location: `apps/self/src/adapters/filesystem-blob.ts:133-147`
- Risk: 1GB upload = 1GB memory spike

### Caching Strategy

| Layer | Cache | TTL | Location |
|-------|-------|-----|----------|
| Edge (CF) | Public blobs | 1 year | `gateway-core/src/endpoints/blob/public-download.ts` |
| Presigned | None | N/A | Each URL unique |
| KV metadata | None | N/A | Always fresh |
| Namespace aliases | KV | Permanent | `gateway-core/src/lib/namespace-alias.ts` |

---

## Cost Analysis

### Cloudflare Pricing Model (2025)

#### Free Tier Limits

| Resource | Free Limit | Overage Cost |
|----------|------------|--------------|
| Worker Requests | 100,000/day | $0.50/million |
| KV Read | 1,000,000/day | $0.50/million |
| KV Write | 100,000/day | $5.00/million |
| KV Storage | 1GB | $0.50/GB/month |
| R2 Storage | 10GB | $0.015/GB/month |
| R2 Class A (write) | 1M/month | $4.50/million |
| R2 Class B (read) | 10M/month | $0.36/million |
| DO Requests | N/A | $0.15/million |
| DO Storage | 1GB | $0.20/GB/month |

#### Cost Drivers for Federise

**High-Cost Operations:**

1. **KV Writes** (most expensive per-op)
   - Each blob upload = 2 KV writes (metadata + alias)
   - 1000 uploads/day = 2000 writes ≈ free tier limit
   - Solution: Batch metadata updates

2. **R2 Class A Operations**
   - Each upload = 1 PUT operation
   - 10,000 uploads/day = $0.045/day ≈ $1.35/month
   - Solution: Client-side upload deduplication

3. **Durable Object Requests**
   - Each log append = 1+ DO requests
   - High-volume logs add up quickly
   - Solution: Batch append operations

**Low-Cost Operations:**
- R2 downloads (Class B): $0.000036 per request
- KV reads: $0.0000005 per read
- Worker requests (under 100k/day): Free

#### Monthly Cost Estimates

| Usage Profile | Workers | KV | R2 | DO | Total |
|--------------|---------|----|----|-------|-------|
| Light (1K ops/day) | Free | Free | ~$0.15 | ~$0.05 | ~$0.20/mo |
| Medium (10K ops/day) | Free | ~$1.50 | ~$1.35 | ~$0.50 | ~$3.35/mo |
| Heavy (100K ops/day) | ~$1.50 | ~$15 | ~$13.50 | ~$4.50 | ~$34.50/mo |
| Enterprise (1M ops/day) | ~$15 | ~$150 | ~$135 | ~$45 | ~$345/mo |

### Self-Hosted Cost Model

#### Infrastructure Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 1 core | 2+ cores |
| RAM | 512MB | 2GB+ |
| Storage | 10GB | 100GB+ |
| Network | 100Mbps | 1Gbps |

#### Estimated Monthly Costs

| Provider | Instance Type | Monthly Cost |
|----------|--------------|--------------|
| DigitalOcean | Basic Droplet | ~$5-10 |
| Hetzner | CX11 | ~$4 |
| AWS EC2 | t3.micro | ~$8-10 |
| Self-hosted | Existing hardware | $0 (+ electricity) |

**Trade-offs:**
- Lower operational cost at scale
- Higher management overhead
- No geographic distribution
- Single point of failure

---

## Known Issues & Bugs

### Critical Issues

| ID | Component | Issue | Impact |
|----|-----------|-------|--------|
| BUG-001 | gateway-core | Namespace alias collision handling incomplete | Data corruption risk |
| BUG-002 | apps/self | No graceful shutdown handler | Data loss on SIGTERM |
| BUG-003 | apps/self | Memory exhaustion on large file uploads | Service crash |
| BUG-004 | gateway-core | Presigned URL orphaned metadata | Storage leak |

### High Priority Issues

| ID | Component | Issue | Impact |
|----|-----------|-------|--------|
| BUG-005 | apps/gateway | Single DO bottleneck per log | Throughput limit |
| BUG-006 | gateway-core | No SSE heartbeat | Connection timeouts |
| BUG-007 | apps/org | KV delete uses empty string instead of delete | Storage waste |
| BUG-008 | apps/self | Presigned bucket logic uses string matching | Security risk |

### Medium Priority Issues

| ID | Component | Issue | Impact |
|----|-----------|-------|--------|
| BUG-009 | gateway-core | Principal listing is N+1 pattern | Performance |
| BUG-010 | apps/demo | Poll interval not configurable | Fixed overhead |
| BUG-011 | SDK | No request retry logic | Reliability |
| BUG-012 | gateway-core | SSE 1-second poll interval | Load generation |

### Low Priority Issues

| ID | Component | Issue | Impact |
|----|-----------|-------|--------|
| BUG-013 | SDK | No batch operations | API overhead |
| BUG-014 | SDK | No caching layer | Repeated requests |
| BUG-015 | apps/org | No input validation on principal names | Data quality |

---

## Recommendations

### Security Recommendations

**Priority 1 (Critical):**
1. Encrypt API keys in localStorage using Web Crypto
2. Remove or gate test endpoints in production builds
3. Move bootstrap key to Cloudflare secrets management
4. Implement rate limiting on auth endpoints

**Priority 2 (High):**
5. Add audit logging for permission changes
6. Implement token revocation mechanism
7. Add CSRF tokens to permission grant flow
8. Validate frame URL against allowlist

**Priority 3 (Medium):**
9. Add Referrer-Policy headers for token URLs
10. Implement API key rotation mechanism
11. Add structured error codes for security events

### Performance Recommendations

**Priority 1 (Critical):**
1. Implement log sharding for high-throughput scenarios
2. Add SSE heartbeat to prevent connection timeouts
3. Implement true streaming for self-hosted uploads

**Priority 2 (High):**
4. Batch KV writes for metadata operations
5. Add cursor-based pagination for large lists
6. Implement connection pooling in self-hosted

**Priority 3 (Medium):**
7. Add adaptive polling for SSE subscriptions
8. Implement client-side caching in SDK
9. Add request deduplication

### Cost Optimization Recommendations

1. **Reduce KV Writes:**
   - Batch metadata updates (10+ at once)
   - Cache alias lookups client-side
   - Defer non-critical writes

2. **Optimize R2 Usage:**
   - Use presigned URLs (client uploads direct)
   - Set appropriate Cache-Control headers
   - Implement deduplication by content hash

3. **Control DO Requests:**
   - Implement batch append API
   - Client-side buffering for high-frequency writes
   - Consider archiving old events

4. **Monitor Usage:**
   - Enable Cloudflare Analytics
   - Set up billing alerts
   - Track per-tenant usage for chargebacks

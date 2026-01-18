# Alternative 3: Headless API + Optional UI

## Core Idea

Expose identity operations as **pure APIs**. Apps can:
- Build their own UI (full control)
- Use SDK-provided UI components (convenience)
- Mix and match

This is the most flexible approach, treating identity like any other capability.

---

## The API Layer

### Core Endpoints

| Endpoint | Purpose | Auth Required |
|----------|---------|---------------|
| `POST /token/lookup` | Get token metadata (who invited, what grants) | Token |
| `POST /token/claim` | Claim identity with minimal info | Token |
| `POST /token/claim-with-password` | Claim with password (for API key access) | Token |
| `POST /session/create` | Create session from API key | API Key |
| `POST /session/refresh` | Extend session | Session Token |
| `GET /identity/me` | Get current identity | Session or API Key |

### Minimal Claim (No Password)

```http
POST /token/claim
Content-Type: application/json

{
  "tokenId": "tok_abc123...",
  "displayName": "Alice"
}
```

Response:
```json
{
  "identityId": "ident_xyz789",
  "displayName": "Alice",
  "sessionToken": "sess_...",
  "expiresAt": "2024-01-15T12:00:00Z"
}
```

No password required. The identity exists, has a session, can be used immediately.

### Full Claim (With Password)

```http
POST /token/claim-with-password
Content-Type: application/json

{
  "tokenId": "tok_abc123...",
  "displayName": "Alice",
  "password": "securepassword123"
}
```

Response:
```json
{
  "identityId": "ident_xyz789",
  "displayName": "Alice",
  "sessionToken": "sess_...",
  "apiKey": "frs_abc123...",
  "apiKeyExpiresAt": null
}
```

Password creates an API key for direct gateway access.

---

## SDK Layers

### Level 1: Raw API (Most Control)

App handles everything, SDK is just a transport:

```typescript
// App does its own UI
const name = await showNamePrompt();

// App calls claim directly
const response = await fetch(`${gatewayUrl}/token/claim`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ tokenId: token, displayName: name }),
});

const { sessionToken, identityId } = await response.json();

// App stores session
localStorage.setItem('session', sessionToken);
```

### Level 2: SDK Wrapper (Simpler)

SDK handles the API call, session storage, error handling:

```typescript
// App does its own UI
const name = await showNamePrompt();

// SDK handles the rest
const result = await client.identity.claim(token, {
  displayName: name,
});

// result: { identityId, displayName }
// Session stored automatically, used for subsequent requests
```

### Level 3: SDK UI Components (Easiest)

SDK provides the entire flow:

```typescript
// SDK does everything
const result = await client.identity.claimWithUI(token);

// Or with options
const result = await client.identity.claimWithUI(token, {
  mode: 'popup',      // or 'modal', 'redirect'
  requirePassword: false,
});
```

---

## App Integration Patterns

### Pattern A: Fully Custom UI

App wants complete control over the claim experience:

```svelte
<script>
  import { getClient } from './federise';

  let name = '';
  let claiming = false;
  let error = null;

  async function handleClaim() {
    claiming = true;
    error = null;

    try {
      const client = getClient();
      await client.identity.claim(inviteToken, { displayName: name });
      // Success - redirect or update UI
      window.location.href = '/dashboard';
    } catch (e) {
      error = e.message;
    } finally {
      claiming = false;
    }
  }
</script>

<div class="my-custom-claim-ui">
  <h1>You've been invited!</h1>
  <input bind:value={name} placeholder="Your name" />
  <button on:click={handleClaim} disabled={claiming}>
    {claiming ? 'Joining...' : 'Join'}
  </button>
  {#if error}<p class="error">{error}</p>{/if}
</div>
```

### Pattern B: SDK UI with App Shell

App provides the container, SDK provides the form:

```svelte
<script>
  import { getClient } from './federise';
  import { onMount } from 'svelte';

  let container;

  onMount(async () => {
    const client = getClient();
    await client.identity.renderClaimForm(inviteToken, {
      container,
      onSuccess: () => window.location.href = '/dashboard',
      onCancel: () => window.location.href = '/',
    });
  });
</script>

<div class="my-app-shell">
  <header>Welcome to MyApp</header>
  <main bind:this={container}>
    <!-- SDK renders claim form here -->
  </main>
</div>
```

### Pattern C: Automatic (Zero Code)

SDK handles detection and claim automatically:

```typescript
// In app initialization
const client = new FederiseClient({
  frameUrl: 'https://federise.org/frame',
  autoHandleInvites: true, // SDK detects invite tokens, shows claim UI
});
```

---

## Passwordless vs Password

### When to Use Passwordless

- Quick collaboration (join a channel for a meeting)
- Single-device usage
- Low-stakes access
- Bot/service accounts

### When to Require Password

- Multi-device access needed
- Long-term account ownership
- Administrative access
- Direct API usage (outside apps)

### Progressive Enhancement

Start passwordless, upgrade later:

```
┌──────────────────────────────────────────────────────────────┐
│ Initial: Passwordless claim                                  │
│   - Display name only                                        │
│   - Session-based auth                                       │
│   - Single device                                            │
│                                                              │
│         ▼ User wants more ▼                                  │
│                                                              │
│ Upgrade: Add password                                        │
│   POST /identity/me/add-password                            │
│   - Now has API key                                          │
│   - Multi-device access                                      │
│   - Direct gateway access                                    │
└──────────────────────────────────────────────────────────────┘
```

SDK method:
```typescript
// Later, user wants to add a password
await client.identity.addPassword('mysecurepassword');
// Returns: { apiKey: 'frs_...' }
```

---

## Session Management

### Session Lifecycle

```
Created (on claim/login)
    │
    ▼
Active ◄─── Refreshed (before expiry)
    │
    ▼
Expired
```

### Automatic Refresh

SDK handles session refresh transparently:

```typescript
class SessionManager {
  private session: Session | null = null;
  private refreshTimer: number | null = null;

  setSession(token: string, expiresAt: Date): void {
    this.session = { token, expiresAt };
    this.scheduleRefresh();
  }

  private scheduleRefresh(): void {
    if (!this.session) return;

    // Refresh 5 minutes before expiry
    const refreshAt = this.session.expiresAt.getTime() - 5 * 60 * 1000;
    const delay = refreshAt - Date.now();

    if (delay > 0) {
      this.refreshTimer = setTimeout(() => this.refresh(), delay);
    }
  }

  private async refresh(): Promise<void> {
    const response = await fetch(`${this.gatewayUrl}/session/refresh`, {
      method: 'POST',
      headers: {
        'Authorization': `Session ${this.session.token}`,
      },
    });

    const { sessionToken, expiresAt } = await response.json();
    this.setSession(sessionToken, new Date(expiresAt));
  }
}
```

### Session Storage

```typescript
// SDK stores session in appropriate location
class SessionStorage {
  store(session: Session): void {
    // Options based on context:
    // 1. Memory only (most secure, lost on page close)
    // 2. sessionStorage (survives refresh, not new tabs)
    // 3. localStorage (persists, accessible to XSS)
    // 4. HttpOnly cookie (most secure for web, requires gateway support)

    sessionStorage.setItem('federise:session', JSON.stringify(session));
  }
}
```

---

## Gateway Implementation

### Claim Endpoint

```typescript
// POST /token/claim
async function handleClaim(request: Request, ctx: GatewayContext): Promise<Response> {
  const { tokenId, displayName } = await request.json();

  // Look up token
  const token = await ctx.kv.get(`__TOKEN:${tokenId}`);
  if (!token || token.status !== 'pending') {
    return errorResponse(400, 'Invalid or expired token');
  }

  // Check expiry
  if (token.expiresAt && token.expiresAt < Date.now()) {
    return errorResponse(400, 'Token expired');
  }

  // Create identity
  const identity = await createIdentity({
    type: token.payload.identityType || 'USER',
    displayName,
    createdBy: token.payload.createdBy,
    grants: token.payload.grants,
  });

  // Mark token as used
  await ctx.kv.put(`__TOKEN:${tokenId}`, {
    ...token,
    status: 'claimed',
    claimedAt: Date.now(),
    claimedBy: identity.id,
  });

  // Create session
  const session = await createSession(identity.id);

  return jsonResponse({
    identityId: identity.id,
    displayName: identity.displayName,
    sessionToken: session.token,
    expiresAt: session.expiresAt,
  });
}
```

### Session Endpoint

```typescript
// POST /session/create (from API key)
async function handleSessionCreate(request: Request, ctx: GatewayContext): Promise<Response> {
  const { apiKey } = await request.json();

  // Verify API key
  const identity = await authenticateApiKey(apiKey);
  if (!identity) {
    return errorResponse(401, 'Invalid API key');
  }

  // Create session
  const session = await createSession(identity.id);

  return jsonResponse({
    sessionToken: session.token,
    expiresAt: session.expiresAt,
  });
}

// POST /session/refresh
async function handleSessionRefresh(request: Request, ctx: GatewayContext): Promise<Response> {
  const oldSession = await authenticateSession(request);
  if (!oldSession) {
    return errorResponse(401, 'Invalid session');
  }

  // Create new session
  const newSession = await createSession(oldSession.identityId);

  return jsonResponse({
    sessionToken: newSession.token,
    expiresAt: newSession.expiresAt,
  });
}
```

---

## Comparison with Other Alternatives

| Aspect | Alt 1: Capability-Only | Alt 2: SDK UI | Alt 3: Headless |
|--------|------------------------|---------------|-----------------|
| App control | Low | Medium | High |
| App effort | Very Low | Low | Medium |
| Customization | None | Theme only | Full |
| Identity required | No | Yes | Optional |
| Password required | No | Yes | Optional |
| Opinionation | Low | Medium | Low |

---

## Migration Path

### Phase 1: Add Passwordless Claim
- New `/token/claim` endpoint (no password)
- Session token response
- Existing password flow unchanged

### Phase 2: Session Management
- `/session/create` and `/session/refresh` endpoints
- SDK session management
- Auto-refresh logic

### Phase 3: SDK Layers
- Add `identity.claim()` method
- Add `identity.claimWithUI()` for convenience
- Update documentation

### Phase 4: Progressive Password
- Add `/identity/me/add-password` endpoint
- SDK method to upgrade identity
- Encourage passwordless by default

---

## Open Questions

1. **Session lifetime**: How long should sessions last? (1 hour? 24 hours? Configurable?)

2. **Refresh tokens**: Should we have separate refresh tokens, or just refresh sessions directly?

3. **Concurrent sessions**: Can an identity have multiple active sessions? (Multiple devices)

4. **Session revocation**: How to revoke all sessions? (Password change, security breach)

5. **Offline support**: How do sessions work offline? (Local token validation?)

6. **UI component distribution**: How are SDK UI components delivered? (Bundle size concerns)

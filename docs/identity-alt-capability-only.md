# Alternative 1: Capability-Only Model

## Core Idea

**Identity is optional.** Most users just need access to resources - they don't need "accounts."

A capability token IS the identity. It grants access to specific resources with specific permissions for a specific time period. No passwords, no API keys, no account setup.

---

## How Sharing Would Work

### Current Flow (Account Required)
```
Owner → Create invitation → Send link → Recipient opens federise.org
→ Set password → Get API key → Configure app → Finally access channel
```

### Capability-Only Flow
```
Owner → Create token → Send link → Recipient opens app → Immediate access
```

That's it. The token in the URL IS the credential.

---

## Token Design

### What's in a Capability Token

```
┌──────────────────────────────────────────────────────────────┐
│ Version (1 byte) │ Type (1 byte) │ Resource ID │ Permissions │
├──────────────────────────────────────────────────────────────┤
│ Constraints (expiry, uses) │ Signature (12 bytes)           │
└──────────────────────────────────────────────────────────────┘
```

- **Self-contained**: All info needed to validate is in the token
- **Stateless verification**: Gateway doesn't need to look up anything (for basic validation)
- **Revocable**: Optional state check for high-security scenarios

### Token Lifecycle

```
Created ──► Active ──► Expired
              │
              └──► Revoked (optional, requires state)
```

### Token Storage (Client Side)

The SDK manages token storage transparently:

```typescript
// SDK internals (app never sees this)
class TokenStore {
  private tokens: Map<string, StoredToken> = new Map();

  store(resourceId: string, token: string): void {
    localStorage.setItem(`federise:token:${resourceId}`, token);
  }

  get(resourceId: string): string | null {
    return localStorage.getItem(`federise:token:${resourceId}`);
  }

  // Auto-attach to requests
  getForRequest(resourceType: string, resourceId: string): string | null {
    return this.get(`${resourceType}:${resourceId}`);
  }
}
```

---

## SDK API Changes

### Creating Share Links (Owner)

```typescript
// Current API (unchanged)
const result = await client.channel.createToken(channelId, ['read', 'append']);
// Returns: { token, gatewayUrl, expiresAt }

// Generate shareable URL (app responsibility)
const shareUrl = `${appUrl}/channel#${result.token}@${encode(result.gatewayUrl)}`;
```

### Consuming Share Links (Recipient)

```typescript
// App detects token in URL
const { token, gatewayUrl } = parseShareUrl(window.location);

// Initialize SDK with token (new pattern)
const client = new FederiseClient({
  gatewayUrl,
  token, // Direct token auth, no frame needed
});

// Or: Add token to existing client
client.addResourceToken('channel', channelId, token);

// Use normally - SDK attaches token automatically
const messages = await client.channel.getEvents(channelId);
```

### Auto-Authentication

The SDK handles token attachment automatically:

```typescript
// Internal SDK logic
async request(resourceType: string, resourceId: string, ...args) {
  const token = this.tokenStore.getForRequest(resourceType, resourceId);
  if (token) {
    headers['Authorization'] = `CapabilityToken ${token}`;
  }
  // ... make request
}
```

---

## What Apps Need to Do

### Minimal Integration

```typescript
// 1. Parse URL for tokens (once, on load)
function initFromUrl() {
  const hash = window.location.hash.slice(1);
  if (hash.includes('@')) {
    const [token, encodedGateway] = parseTokenUrl(hash);
    const gatewayUrl = decode(encodedGateway);

    // Store for future use
    sessionStorage.setItem('federise:token', token);
    sessionStorage.setItem('federise:gateway', gatewayUrl);
  }
}

// 2. Initialize SDK with token
const client = new FederiseClient({
  gatewayUrl: sessionStorage.getItem('federise:gateway'),
  token: sessionStorage.getItem('federise:token'),
});

// 3. Use normally
await client.channel.append(channelId, { text: 'Hello!' });
```

### What Apps DON'T Need to Do

- Display password forms
- Handle API key storage
- Redirect to federise.org
- Manage account creation
- Show "save your API key" warnings

---

## Gateway Changes

### New Auth Mode

```typescript
// Current: ApiKey or Bearer
// New: Also CapabilityToken

function authenticate(request: Request): AuthContext {
  const auth = request.headers.get('Authorization');

  if (auth?.startsWith('ApiKey ')) {
    return authenticateApiKey(auth.slice(7));
  }
  if (auth?.startsWith('Bearer ')) {
    return authenticateBearer(auth.slice(7));
  }
  if (auth?.startsWith('CapabilityToken ')) {
    return authenticateCapabilityToken(auth.slice(16));
  }

  throw new AuthError('No valid authentication');
}

function authenticateCapabilityToken(token: string): AuthContext {
  const decoded = decodeToken(token);

  // Verify signature
  if (!verifySignature(decoded)) {
    throw new AuthError('Invalid token signature');
  }

  // Check expiry
  if (decoded.expiresAt < Date.now()) {
    throw new AuthError('Token expired');
  }

  // Optional: Check revocation list (if token has requiresStateCheck flag)
  if (decoded.requiresStateCheck && await isRevoked(decoded.id)) {
    throw new AuthError('Token revoked');
  }

  // Return limited auth context
  return {
    type: 'capability',
    resourceType: decoded.resourceType,
    resourceId: decoded.resourceId,
    permissions: decoded.permissions,
    // No identity - anonymous access
  };
}
```

### Authorization Changes

```typescript
// Current: Check identity's grants
// New: Also check capability token permissions

function authorize(ctx: AuthContext, action: string, resource: Resource): boolean {
  if (ctx.type === 'capability') {
    // Token-based auth: check if token grants this permission
    return (
      ctx.resourceType === resource.type &&
      ctx.resourceId === resource.id &&
      ctx.permissions.includes(action)
    );
  }

  // Identity-based auth: existing grant checking
  return checkIdentityGrants(ctx.identity, action, resource);
}
```

---

## When Persistent Identity IS Needed

Capability tokens work great for:
- Viewing shared content
- Collaborating on channels
- Temporary access

But some users need more:
- **Multiple devices**: Token is stuck in one browser
- **Long-term ownership**: Tokens expire, identity doesn't
- **Administrative actions**: Managing the gateway itself
- **Audit trails**: "Who" did what, not just "a token"

### Upgrade Path

Offer an opt-in upgrade within the app:

```
┌─────────────────────────────────────────────────────────────┐
│  You're using guest access.                                 │
│                                                             │
│  [Continue as guest]  [Create account for more features]    │
└─────────────────────────────────────────────────────────────┘
```

If they choose to upgrade:
1. SDK opens popup to federise.org
2. User creates lightweight identity (just display name)
3. Existing token permissions transfer to identity
4. Now they have persistent access

---

## Security Considerations

### Token Exposure

| Risk | Mitigation |
|------|------------|
| Token in URL visible in history | Clear hash after parsing |
| Token in localStorage accessible to XSS | Use httpOnly cookies (requires gateway cooperation) |
| Token shared beyond intended recipient | Short expiry, use limits, revocation |
| Token reused after revocation | requiresStateCheck flag for sensitive resources |

### Compared to Current Model

| Aspect | Current (Account) | Capability-Only |
|--------|-------------------|-----------------|
| Credential exposure | API key shown once | Token in URL |
| Storage security | User's responsibility | SDK-managed |
| Revocation | Immediate (delete credential) | Depends on token type |
| Blast radius | All user access | Single resource |

---

## Migration Path

### Phase 1: Add Capability Auth
- Gateway accepts CapabilityToken auth
- SDK supports token-based initialization
- Existing flows unchanged

### Phase 2: Simplify Share Flow
- Default share creates capability token (not invitation)
- "Create account" becomes an option, not the default
- Apps get simpler integration

### Phase 3: Optional Identity
- Remove mandatory account creation
- Identity is opt-in upgrade
- Claim flow only for users who want accounts

---

## Open Questions

1. **Token renewal**: When a capability token nears expiry, can the SDK auto-renew? (Would need refresh token pattern)

2. **Permission escalation**: Can a capability token be upgraded to add more permissions? (Probably not - create new token)

3. **Cross-app tokens**: Can a token from App A be used in App B? (Security implications)

4. **Display names**: How do we show "who" sent a message if they're just a token? (Anonymous? Token prefix?)

5. **Ownership transfer**: If a token-holder creates a sub-resource, who owns it?

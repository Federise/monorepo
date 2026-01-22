# Gateway HTTP Proxy

## Concept

The user's gateway acts as HTTP infrastructure they control - a personal proxy for both outbound requests and inbound webhooks. Apps make HTTP requests through the gateway; the gateway applies user-configured rules for authentication, routing, and session management.

This enables frontend-only apps to access resources that would normally require backend infrastructure.

## Core Principle

**It's just the user's HTTP proxy.** Like running nginx on your own server. The user decides what goes through it and how. Apps don't need to know what services the user connects to - they just work with URLs.

## Why This Matters

| Traditional App | Federise Gateway |
|-----------------|------------------|
| App needs API keys for each service | User owns credentials |
| App developer pays for API access | Single-user economics |
| CORS blocks frontend requests | Gateway makes server-side requests |
| App sees user's tokens | App only sees responses |
| Requires backend infrastructure | User's gateway is the backend |

---

## Outbound: Proxy Fetch

Apps request URLs through the gateway. The gateway applies user-configured rules.

### What the App Sees

```typescript
// App requests capability for URL patterns
capabilities: [
  'fetch:https://api.example.com/*',
  'fetch:https://other-site.com/api/*',
]

// Simple fetch - app doesn't know auth details
const response = await gateway.fetch('https://api.example.com/data');
```

### What the User Configures (Privately)

The user defines rules in their gateway. Apps never see this configuration.

```typescript
{
  proxyRules: [
    {
      match: 'https://api.example.com/*',
      session: 'my-example-session', // saved browser session
    },
    {
      match: 'https://other-site.com/*',
      headers: { 'Authorization': 'Bearer ${secrets.other_token}' },
    },
  ]
}
```

---

## Session Capture: Embedded Browser

Instead of requiring OAuth integrations or API keys, users authenticate normally through an embedded browser. The gateway captures the resulting session state.

### The Flow

```
┌─────────────────────────────────────────────────────────────┐
│  1. User opens embedded browser (WebAssembly-based)         │
├─────────────────────────────────────────────────────────────┤
│  2. User navigates to any site and logs in normally         │
│     - Regular username/password                             │
│     - OAuth consent screens                                 │
│     - MFA challenges                                        │
│     - CAPTCHA                                               │
├─────────────────────────────────────────────────────────────┤
│  3. User clicks "Save Session"                              │
│     Gateway captures:                                       │
│     - Cookies                                               │
│     - localStorage                                          │
│     - sessionStorage                                        │
│     - IndexedDB (optional)                                  │
├─────────────────────────────────────────────────────────────┤
│  4. Session stored in gateway, associated with domain       │
├─────────────────────────────────────────────────────────────┤
│  5. Future requests to that domain use saved state          │
│     Site sees normal authenticated browser request          │
└─────────────────────────────────────────────────────────────┘
```

### Why This Works

- **No API integration required** - works with any website
- **User authenticates normally** - site can't tell the difference
- **Handles everything** - MFA, CAPTCHA, consent screens, CAPTCHAs
- **The "credential" is browser state** - not tokens or passwords
- **Apps never see the auth flow** - only the resulting data

### API Shape

```typescript
// User manages sessions (in gateway settings UI)
await gateway.sessions.create({
  name: 'my-twitter',
  domains: ['twitter.com', 'api.twitter.com'],
});
// Opens embedded browser, user logs in, saves state

// App just fetches - gateway attaches session automatically
const data = await gateway.fetch('https://api.twitter.com/data');
```

### Session Refresh

Sessions expire. When a request fails due to auth:

```typescript
{
  status: 'session-expired',
  sessionName: 'my-twitter',
  refreshUrl: 'https://gateway.example/sessions/my-twitter/refresh',
  // User opens URL, re-authenticates in embedded browser
}
```

### Implementation Considerations

- **WebAssembly browser**: Projects like browser-wasi, or embedding Chromium
- **State complexity**: Different sites use different storage mechanisms
- **Detection**: Some sites detect automation - real browser helps
- **Expiry**: Sessions expire; need refresh flow
- **Domain scoping**: Session state only applies to specified domains

---

## Inbound: Webhook Receiver

The gateway provides stable URLs that can receive HTTP requests (webhooks).

### The Flow

```
┌─────────────────┐     ┌─────────────┐     ┌─────────┐
│ External Service│────▶│   Gateway   │────▶│   App   │
│   (webhook)     │     │ (receives)  │     │         │
└─────────────────┘     └─────────────┘     └─────────┘
                              │
                              ▼
                       ┌─────────────┐
                       │   Store for │
                       │  later poll │
                       └─────────────┘
```

### User Configuration

User creates webhook endpoints and defines routing:

```typescript
{
  webhooks: {
    '/notifications': {
      allowFrom: ['*'],  // or specific IPs/domains
      forwardTo: ['app-123', 'app-456'],
    },
    '/payments': {
      allowFrom: ['stripe.com'],
      forwardTo: ['app-789'],
      store: true,  // keep history
    },
  }
}
```

### App Subscription

```typescript
// App requests webhook capability
capabilities: ['webhook:/notifications']

// App subscribes
await gateway.webhooks.subscribe('/notifications');

// Receives via WebSocket or polling
gateway.on('webhook', (event) => {
  // { path: '/notifications', body: {...}, headers: {...} }
});
```

### Privacy

External services just see a regular URL:
```
https://gateway.example.com/hook/abc123/notifications
```

They don't know it's a Federise gateway or what apps are listening.

---

## Challenge Handling

When the gateway encounters challenges (CAPTCHA, MFA, session expiry), it surfaces them to the user.

### Response Shape

```typescript
const response = await gateway.fetch('https://example.com/api');

// Success:
{ status: 'success', data: {...} }

// Challenge required:
{
  status: 'challenge-required',
  challengeType: 'captcha' | 'mfa' | 'login' | 'consent',
  interactionUrl: 'https://gateway.example/challenges/abc123',
}
```

### Resolution

User opens the interaction URL, which shows the embedded browser at the challenge. User completes it normally, gateway captures updated state and retries.

---

## Permission Model

### Capability Requests

Apps request URL-pattern based capabilities:

```typescript
capabilities: [
  'fetch:https://api.example.com/*',      // outbound to specific domain
  'fetch:https://*/api/public/*',          // pattern matching
  'webhook:/my-endpoint',                  // inbound webhook
]
```

### User Approval

User sees:
> "App X wants to:
> - Make requests to api.example.com
> - Receive webhooks at /my-endpoint"

User doesn't have to reveal what credentials they use for api.example.com.

---

## Security Considerations

- **Apps never see credentials** - only responses
- **Gateway is trust boundary** - user controls what flows through
- **Domain scoping** - sessions only apply to their configured domains
- **Audit logging** - all proxy requests logged
- **Encrypted storage** - session state encrypted at rest
- **User revocation** - can delete sessions or revoke app access anytime

---

## Integration with Existing Concepts

### Vault

Sessions stored as vault entries:
```typescript
{
  type: 'browser-session',
  name: 'my-twitter',
  domains: ['twitter.com', 'api.twitter.com'],
  state: { /* encrypted cookies, storage */ },
  capturedAt: '2024-...',
  expiresAt: '2024-...',
}
```

### Capabilities

Extends existing capability system:
```typescript
capabilities: [
  'channel:read',           // existing
  'fetch:https://...',      // new: proxy fetch
  'webhook:/path',          // new: webhook subscription
]
```

---

## Minimal POC Scope

1. **Generic proxy fetch** - gateway fetches URL, returns response
2. **Manual header injection** - user configures headers per domain pattern
3. **Simple permission** - app can or cannot fetch a domain pattern
4. **No embedded browser yet** - user manually provides session cookies

## Future Extensions

- WebAssembly embedded browser for session capture
- Automatic session refresh
- Request/response transformation
- Caching layer
- Rate limit awareness
- Webhook storage and replay
- Session sharing between user's devices

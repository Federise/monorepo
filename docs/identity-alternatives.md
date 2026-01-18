# Identity Flow Alternatives

## Context

Federise's core philosophy is **unopinionated capability provisioning** - apps get capabilities (KV, Blob, Channels) and decide how to use them. The system doesn't dictate app behavior.

The current identity/claim system is more opinionated:
- Prescribes a specific onboarding flow (password form → API key display)
- The claim UI lives on federise.org, not in the app
- Dictates how users receive and activate invitations

This document explores alternative approaches that maintain simplicity while respecting the unopinionated philosophy.

**Key Constraint**: Apps should NOT have to manage identity or store credentials.

---

## Current Approach: Centralized Claim Flow

### How It Works

1. App owner creates invitation via SDK: `client.channel.inviteToChannel(...)`
2. SDK returns a URL pointing to federise.org: `federise.org/claim#token@gateway`
3. Recipient opens URL in browser
4. Federise.org shows password setup form
5. User sets password, receives API key
6. User manually configures their app with the API key

### Pros
- Federise controls the entire identity flow
- Consistent UX across all apps
- Apps never touch credentials

### Cons
- **Opinionated**: Prescribes password-based account creation
- **Context switch**: User leaves the app to complete setup
- **Manual credential transfer**: User must copy/paste API key
- **No flexibility**: Apps can't customize the flow

---

## Alternative 1: Capability-Only (No Persistent Identity)

### Philosophy

Identity is optional. For many use cases, apps just need **capability tokens** - time-limited access to specific resources. No accounts, no passwords, no API keys.

### How It Works

**Sharing a channel:**
1. App owner creates a capability token: `client.channel.createToken(channelId, permissions)`
2. Returns URL: `app.com/channel#token@gateway`
3. Recipient opens URL
4. SDK automatically authenticates using the token
5. Token is stored in browser (localStorage or cookie)
6. User has access until token expires

**No account creation required.** The token IS the identity.

### Token Characteristics

| Property | Value |
|----------|-------|
| Lifetime | Configurable (default 7 days, max 1 year) |
| Revocable | Yes (via revocation list or secret rotation) |
| Renewable | Optional - can issue "refresh" capability |
| Scope | Limited to specific resources and permissions |
| Storage | Browser localStorage, managed by SDK |

### When Persistent Identity Is Needed

For users who need:
- Multiple devices
- Credential rotation
- Administrative access
- Audit trails

Offer an **upgrade path**:
```
Token-based access → "Save to account" → Account created
```

This is opt-in, not required.

### Example Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        APP (Demo)                            │
├─────────────────────────────────────────────────────────────┤
│  1. Owner clicks "Share Channel"                            │
│  2. SDK creates capability token                            │
│  3. Owner sends link to recipient                           │
│                                                             │
│  ─────────────── Link sent via email/chat ───────────────  │
│                                                             │
│  4. Recipient clicks link, arrives at app.com/channel#token │
│  5. SDK reads token from URL, validates with gateway        │
│  6. SDK stores token in localStorage                        │
│  7. User has immediate access - no setup required           │
└─────────────────────────────────────────────────────────────┘
```

### Pros
- **Truly unopinionated**: Apps decide if/when identity matters
- **Zero friction**: Click link, get access
- **No credential management**: Token is self-contained
- **Privacy-friendly**: No account required for basic access

### Cons
- **Single device**: Token stuck in one browser (unless shared)
- **No recovery**: Lost token = lost access (unless revocable + reissuable)
- **Limited audit**: Harder to track "who" did what

### Implementation Changes

1. **SDK changes**: Store capability tokens in localStorage, auto-attach to requests
2. **Gateway changes**: Minimal - already supports token-based auth
3. **App changes**: None required
4. **Org app changes**: Remove/simplify claim flow (optional upgrade path only)

---

## Alternative 2: SDK-Embedded UI

### Philosophy

Apps control when and where identity flows appear, but Federise provides the UI components so apps don't build them.

### How It Works

The SDK includes embeddable UI components:

```typescript
// Option A: Popup (current authorize pattern)
await client.identity.claimInPopup(token);

// Option B: Modal in current page
await client.identity.showClaimModal(token, {
  container: document.getElementById('modal-container')
});

// Option C: Redirect (current pattern)
client.identity.claimViaRedirect(token);
```

### Component Characteristics

| Property | Value |
|----------|-------|
| Styling | Themeable to match app |
| Location | App-controlled (popup, modal, inline) |
| Flow | Federise-controlled (secure) |
| Credentials | Never exposed to app |

### Example Flow (Popup)

```
┌─────────────────────────────────────────────────────────────┐
│                        APP (Demo)                            │
├─────────────────────────────────────────────────────────────┤
│  1. Recipient clicks link: app.com/invite#token             │
│  2. App detects invitation token                            │
│  3. App calls: client.identity.claimInPopup(token)          │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              POPUP (from federise.org)               │   │
│  │  ┌───────────────────────────────────────────────┐  │   │
│  │  │  Welcome! Set up your account                 │  │   │
│  │  │  ─────────────────────────────────────────── │  │   │
│  │  │  Display Name: [Alice                      ]  │  │   │
│  │  │  Password:     [••••••••                   ]  │  │   │
│  │  │  Confirm:      [••••••••                   ]  │  │   │
│  │  │  ─────────────────────────────────────────── │  │   │
│  │  │  [Cancel]                    [Create Account] │  │   │
│  │  └───────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  4. User completes form in popup                            │
│  5. Popup closes, app receives success callback             │
│  6. SDK now has credentials, user is authenticated          │
│  7. App continues - user never saw an API key               │
└─────────────────────────────────────────────────────────────┘
```

### Credential Handling

The key insight: **apps don't need to see credentials**.

After claim:
1. Popup creates identity + credential on gateway
2. Popup sends `postMessage` to SDK with a **session token** (not the API key)
3. SDK stores session token securely
4. Session token is used for subsequent requests
5. API key is stored by org app for "manage account" scenarios

This is similar to OAuth - the app gets a session, not raw credentials.

### Pros
- **Apps control placement**: Modal, popup, inline - app decides
- **Consistent security**: Federise controls the sensitive parts
- **No credential exposure**: Apps never see API keys
- **Themeable**: Can match app's look and feel

### Cons
- **Still opinionated about flow**: Password form is still prescribed
- **SDK complexity**: More code in the SDK
- **Popup blockers**: May affect UX

### Implementation Changes

1. **SDK changes**: Add `identity.claimInPopup()`, `identity.showClaimModal()` methods
2. **Org app changes**: Add postMessage API for popup communication
3. **Gateway changes**: Issue session tokens alongside API keys
4. **App changes**: Minimal - call SDK method instead of redirecting

---

## Alternative 3: Headless API + Optional UI

### Philosophy

Expose identity operations as APIs. Apps can:
- Use the API directly with their own UI
- Use Federise-provided UI components (optional)
- Mix and match

### How It Works

**Level 1: Raw API**
```typescript
// App builds its own UI, calls API directly
const result = await fetch(`${gatewayUrl}/token/claim`, {
  method: 'POST',
  body: JSON.stringify({ tokenId, displayName })
});
// Returns: { identityId, sessionToken }
```

**Level 2: SDK wrapper**
```typescript
// SDK handles the API call, app provides UI
const result = await client.identity.claim(token, { displayName });
// Returns: { identityId } - session managed internally
```

**Level 3: SDK UI components (optional)**
```typescript
// SDK provides UI, app just invokes
await client.identity.claimWithUI(token);
```

### API Design

| Endpoint | Purpose | UI Required |
|----------|---------|-------------|
| `POST /token/lookup` | Get token metadata | No |
| `POST /token/claim` | Claim identity | No |
| `POST /token/claim-with-password` | Claim with password | No |
| `GET /identity/me` | Get current identity | No |
| `POST /session/create` | Create session from credential | No |

### Credential-Free Claiming

Key idea: **passwords are optional**.

For many use cases, apps don't need passwords:
- Bot/service accounts
- Anonymous collaboration
- Device-specific access

The simplest claim:
```typescript
await client.identity.claim(token, { displayName: 'Alice' });
// No password, no API key displayed
// Just creates identity with session token
```

Password is an **optional upgrade** for users who want:
- Multi-device access
- Account recovery
- Direct API access (outside apps)

### Example Flow (Minimal)

```
┌─────────────────────────────────────────────────────────────┐
│                        APP (Demo)                            │
├─────────────────────────────────────────────────────────────┤
│  1. Recipient clicks link: app.com/invite#token             │
│  2. App detects invitation token                            │
│  3. App shows simple prompt: "Enter your name"              │
│  4. App calls: client.identity.claim(token, { name })       │
│  5. SDK creates identity, stores session                    │
│  6. User has access - done                                  │
│                                                             │
│  (Optional later: "Secure your account" → add password)     │
└─────────────────────────────────────────────────────────────┘
```

### Pros
- **Maximum flexibility**: Apps choose their own UX
- **Minimal friction option**: Just a name, no password
- **Progressive enhancement**: Add security features later
- **API-first**: Works for all client types (web, mobile, CLI)

### Cons
- **Apps must handle some UI**: Even minimal claim needs a prompt
- **Security trade-offs**: Passwordless = less secure (but simpler)
- **Inconsistent UX**: Every app may look different

### Implementation Changes

1. **Gateway changes**: Add passwordless claim endpoint
2. **SDK changes**: Add claim methods, session management
3. **Org app changes**: Optional - provide reference UI components
4. **App changes**: Integrate claim prompt or use SDK UI

---

## Comparison Matrix

| Aspect | Current | Alt 1: Capability-Only | Alt 2: SDK UI | Alt 3: Headless API |
|--------|---------|------------------------|---------------|---------------------|
| **Opinionation** | High | Low | Medium | Low |
| **App burden** | Low | Very Low | Low | Medium |
| **User friction** | Medium | Very Low | Low-Medium | Varies |
| **Credential management** | Manual | None | Hidden | Hidden |
| **Persistent identity** | Required | Optional | Required | Optional |
| **Customizable** | No | N/A | Somewhat | Fully |
| **Security** | High | Medium | High | Varies |
| **Implementation effort** | Done | Low | Medium | Medium |

---

## Recommendation

Consider a **layered approach** combining elements:

### Layer 1: Capability Tokens (Default)
- Anonymous, token-based access
- No account required
- Covers 80% of sharing use cases

### Layer 2: Lightweight Identity (Opt-in)
- Passwordless claim: just a display name
- Session token managed by SDK
- For users who want to be "known"

### Layer 3: Full Identity (Opt-in)
- Add password for multi-device / recovery
- API key for direct access
- For power users / administrators

```
┌─────────────────────────────────────────────────────────────┐
│  Capability Token (anonymous)                               │
│    ↓ opt-in                                                 │
│  Lightweight Identity (display name only)                   │
│    ↓ opt-in                                                 │
│  Full Identity (password + API key)                         │
└─────────────────────────────────────────────────────────────┘
```

This gives apps maximum flexibility while keeping the common path simple.

---

## Open Questions

1. **Token storage**: Where should capability tokens live? localStorage vs cookie vs IndexedDB?

2. **Token refresh**: How do long-lived tokens get renewed without user action?

3. **Cross-device**: How does a capability-only user access from another device?

4. **Revocation UX**: How does an app owner revoke a capability token? (Currently requires identity)

5. **Audit trails**: Without identity, how do we track "who" performed actions?

6. **Upgrade path**: If a user upgrades from token → identity, do their previous actions get associated?

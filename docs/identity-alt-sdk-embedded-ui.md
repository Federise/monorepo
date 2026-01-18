# Alternative 2: SDK-Embedded UI

## Core Idea

Apps control **when and where** identity flows appear. Federise provides the UI components so apps don't have to build secure forms themselves.

The key insight: Apps don't need to see credentials. The SDK can manage the entire flow through embedded UI, returning only a session token to the app.

---

## How It Would Work

### Current Flow
```
App → Redirect to federise.org → User fills form → Redirect back → User configures app manually
```

### SDK-Embedded Flow
```
App → SDK opens popup/modal → User fills form → SDK receives session → App continues
```

The app never leaves. The secure flow happens in a Federise-controlled context (popup/iframe), but the app controls when it triggers.

---

## SDK API

### Popup Mode (Recommended)

```typescript
// App detects invitation token
const inviteToken = parseInviteFromUrl();

// Trigger claim flow in popup
const result = await client.identity.claimInPopup(inviteToken, {
  // Optional customization
  title: 'Join the conversation',
  theme: 'dark',
});

// result: { identityId, displayName }
// SDK now has session - app can make authenticated requests
```

### Modal Mode (Inline)

```typescript
// For apps that don't want popups
const result = await client.identity.claimInModal(inviteToken, {
  container: document.getElementById('claim-container'),
  onCancel: () => console.log('User cancelled'),
});
```

### Redirect Mode (Current Behavior)

```typescript
// For apps that prefer full-page redirect
client.identity.claimViaRedirect(inviteToken, {
  returnUrl: window.location.href,
});

// After redirect back:
const result = await client.identity.completeRedirectClaim();
```

---

## How the Popup Works

### Communication Flow

```
┌────────────────────────────────────────────────────────────────┐
│ APP (demo.app)                                                 │
│                                                                │
│  const result = await client.identity.claimInPopup(token);    │
│       │                                                        │
│       ▼                                                        │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ SDK creates popup window                                  │ │
│  │ URL: federise.org/claim-popup#token=xxx                  │ │
│  └──────────────────────────────────────────────────────────┘ │
│       │                                                        │
└───────│────────────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────────────────────────┐
│ POPUP (federise.org)                                           │
│                                                                │
│  1. Validates token                                            │
│  2. Shows claim form (password, display name)                  │
│  3. User submits                                               │
│  4. Creates identity on gateway                                │
│  5. Generates session token                                    │
│  6. Sends postMessage to opener:                               │
│     { type: 'claim-success', sessionToken, identityId }       │
│  7. Closes popup                                               │
│                                                                │
└────────────────────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────────────────────────┐
│ APP (continued)                                                │
│                                                                │
│  SDK receives postMessage                                      │
│  SDK stores session token internally                           │
│  Promise resolves with { identityId, displayName }            │
│  App continues - never saw credentials                         │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### PostMessage Protocol

```typescript
// Messages from popup to app

interface ClaimSuccessMessage {
  type: 'federise:claim:success';
  sessionToken: string;  // Opaque token for SDK to use
  identityId: string;
  displayName: string;
}

interface ClaimErrorMessage {
  type: 'federise:claim:error';
  error: string;
  code: 'INVALID_TOKEN' | 'EXPIRED' | 'ALREADY_CLAIMED' | 'USER_CANCELLED';
}

interface ClaimCancelMessage {
  type: 'federise:claim:cancel';
}
```

### Security Considerations

```typescript
// SDK validates message origin
window.addEventListener('message', (event) => {
  // Only accept from federise.org
  if (!isValidFederiseOrigin(event.origin)) {
    return;
  }

  // Validate message structure
  if (event.data?.type?.startsWith('federise:claim:')) {
    handleClaimMessage(event.data);
  }
});

function isValidFederiseOrigin(origin: string): boolean {
  const allowed = [
    'https://federise.org',
    'http://localhost:4321', // Dev
  ];
  return allowed.includes(origin);
}
```

---

## Session Token vs API Key

### What the App Gets

The app receives a **session token**, not an API key:

| Property | Session Token | API Key |
|----------|---------------|---------|
| Lifetime | Hours/days (configurable) | Indefinite |
| Scope | Limited to session | Full identity access |
| Revocation | Easy (short-lived) | Manual deletion |
| Storage | SDK-managed | User-managed |
| Visibility | Never shown to user | Shown once, user responsibility |

### How Sessions Work

```
┌─────────────────────────────────────────────────────────────────┐
│ Identity                                                         │
│   └─► Credential (API Key, hashed, stored by gateway)           │
│         └─► Session Token (signed, short-lived)                 │
│               └─► Used by SDK for requests                      │
└─────────────────────────────────────────────────────────────────┘
```

The API key exists for:
- Direct API access (power users)
- Multi-device setup
- Account management on federise.org

But apps just use session tokens.

---

## Theming

### Basic Theming

```typescript
await client.identity.claimInPopup(token, {
  theme: 'dark', // or 'light', 'system'
});
```

### Advanced Theming (CSS Variables)

```typescript
await client.identity.claimInPopup(token, {
  theme: {
    '--primary': '#8b5cf6',
    '--background': '#1a1a2e',
    '--text': '#ffffff',
    '--border-radius': '12px',
  },
});
```

The popup applies these via CSS custom properties.

---

## Org App Changes

### New Popup Endpoint

```
GET /claim-popup
```

A minimal page designed for popup context:
- No navigation
- Compact form
- PostMessage on completion
- Auto-close on success

```astro
---
// apps/org/src/pages/claim-popup.astro
import ClaimPopupFlow from '../components/ClaimPopupFlow.svelte';
---
<html>
<head>
  <title>Join - Federise</title>
  <style>
    body { margin: 0; padding: 20px; }
  </style>
</head>
<body>
  <ClaimPopupFlow client:only="svelte" />
</body>
</html>
```

### ClaimPopupFlow Component

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  let state = $state<'loading' | 'form' | 'success' | 'error'>('loading');
  let displayName = $state('');
  let password = $state('');

  onMount(async () => {
    // Parse token from URL
    const token = parseToken();
    if (!token) {
      sendError('INVALID_TOKEN');
      return;
    }

    // Validate token
    const info = await lookupToken(token);
    if (!info.valid) {
      sendError(info.expired ? 'EXPIRED' : 'INVALID_TOKEN');
      return;
    }

    state = 'form';
  });

  async function handleSubmit() {
    const result = await claimIdentity(token, { displayName, password });

    // Send session token back to opener
    window.opener?.postMessage({
      type: 'federise:claim:success',
      sessionToken: result.sessionToken,
      identityId: result.identityId,
      displayName: result.displayName,
    }, '*'); // SDK validates on receive

    window.close();
  }

  function sendError(code: string) {
    window.opener?.postMessage({
      type: 'federise:claim:error',
      code,
    }, '*');
    window.close();
  }

  function handleCancel() {
    window.opener?.postMessage({
      type: 'federise:claim:cancel',
    }, '*');
    window.close();
  }
</script>
```

---

## SDK Implementation

### claimInPopup Method

```typescript
class IdentityManager {
  async claimInPopup(
    token: string,
    options: ClaimPopupOptions = {}
  ): Promise<ClaimResult> {
    return new Promise((resolve, reject) => {
      // Open popup
      const popupUrl = `${this.orgUrl}/claim-popup#token=${token}`;
      const popup = window.open(
        popupUrl,
        'federise-claim',
        'width=420,height=520,popup=yes'
      );

      if (!popup) {
        reject(new Error('Popup blocked'));
        return;
      }

      // Listen for response
      const handleMessage = (event: MessageEvent) => {
        if (!this.isValidOrigin(event.origin)) return;

        const { data } = event;

        if (data.type === 'federise:claim:success') {
          window.removeEventListener('message', handleMessage);
          this.storeSession(data.sessionToken);
          resolve({
            identityId: data.identityId,
            displayName: data.displayName,
          });
        }

        if (data.type === 'federise:claim:error') {
          window.removeEventListener('message', handleMessage);
          reject(new ClaimError(data.code, data.error));
        }

        if (data.type === 'federise:claim:cancel') {
          window.removeEventListener('message', handleMessage);
          reject(new ClaimError('USER_CANCELLED'));
        }
      };

      window.addEventListener('message', handleMessage);

      // Handle popup closed without message
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', handleMessage);
          reject(new ClaimError('POPUP_CLOSED'));
        }
      }, 500);
    });
  }
}
```

---

## Comparison with Current Approach

| Aspect | Current (Redirect) | Popup Mode |
|--------|-------------------|------------|
| Context switch | Full page redirect | Popup overlay |
| App state | Lost on redirect | Preserved |
| Return handling | Complex URL parsing | PostMessage |
| Credential visibility | API key shown | Never shown |
| User experience | Disorienting | Smoother |
| Popup blockers | N/A | Potential issue |

---

## Migration Path

### Phase 1: Add Popup Endpoint
- Create `/claim-popup` page
- Add postMessage handling
- Session token generation

### Phase 2: SDK Methods
- Add `claimInPopup()` to SDK
- Add session storage
- Maintain backward compatibility with redirect

### Phase 3: Default to Popup
- New apps use popup by default
- Redirect remains available
- Update documentation

---

## Open Questions

1. **Mobile support**: Popups work poorly on mobile. Use redirect fallback?

2. **Iframe alternative**: Could embed in iframe instead of popup for more control?

3. **Multi-step flows**: What if claim needs additional steps (2FA, terms acceptance)?

4. **Session refresh**: How does the session token get refreshed when it expires?

5. **Cross-origin restrictions**: Will some browsers block the popup or postMessage?

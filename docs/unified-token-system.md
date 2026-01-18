# Unified Token System

## Core Principle

**A Token is the fundamental primitive for granting permissions.**

Everything that grants access—channel sharing, file sharing, invitations—is built on the same token primitive. An "invitation" is simply a token with `identity:create` permission and `maxUses: 1`.

## Token Structure

```typescript
interface Token {
  // What this token allows
  permissions: Permission[];

  // Constraints on token usage
  constraints: {
    expiresAt?: number;       // Unix timestamp
    maxUses?: number;         // 1 = single-use (invitation)
    usedCount?: number;       // Track usage
  };

  // Scope: what resources the permissions apply to
  scope: {
    channelId?: string;       // For channel permissions
    blobKey?: string;         // For blob permissions
    namespace?: string;       // For namespace-scoped permissions
  };

  // Metadata (not security-critical)
  metadata: {
    label?: string;           // "For Bob", "Team channel access"
    createdBy?: string;       // Identity ID of creator
    createdAt?: number;       // Timestamp
  };

  // Cryptographic signature
  signature: Uint8Array;
}
```

## Permission Types

```typescript
enum Permission {
  // Channel permissions
  CHANNEL_READ          = 'channel:read',
  CHANNEL_APPEND        = 'channel:append',
  CHANNEL_DELETE_OWN    = 'channel:delete:own',
  CHANNEL_DELETE_ANY    = 'channel:delete:any',
  CHANNEL_READ_DELETED  = 'channel:read:deleted',

  // Blob permissions
  BLOB_READ             = 'blob:read',
  BLOB_WRITE            = 'blob:write',
  BLOB_DELETE           = 'blob:delete',

  // KV permissions (future)
  KV_READ               = 'kv:read',
  KV_WRITE              = 'kv:write',

  // Identity permissions
  IDENTITY_CREATE       = 'identity:create',   // The "invitation" permission
}
```

## Use Cases

### 1. Channel Share Link (Current Behavior)
```typescript
// Creator generates token
const token = createToken({
  permissions: ['channel:read', 'channel:append'],
  scope: { channelId: 'abc123' },
  constraints: { expiresAt: Date.now() + 7 * DAY },
  metadata: { label: 'Public chat access' }
});
// Result: demo.com/chat#<token>@<gateway>
```
- Recipient can read/write to channel using token directly
- No account creation, anonymous access via token

### 2. Invitation (Identity Creation)
```typescript
// Creator generates token
const token = createToken({
  permissions: ['identity:create', 'channel:read', 'channel:append'],
  scope: { channelId: 'abc123' },
  constraints: {
    expiresAt: Date.now() + 7 * DAY,
    maxUses: 1  // Single use = invitation
  },
  metadata: { label: 'For Bob' }
});
// Result: demo.com/chat#<token>@<gateway>
```
- Recipient can create their own identity/credentials
- After setup, they have persistent access (not dependent on token)
- Token is consumed after identity creation

### 3. File Share Link
```typescript
// Creator generates token
const token = createToken({
  permissions: ['blob:read'],
  scope: { blobKey: 'documents/report.pdf' },
  constraints: { expiresAt: Date.now() + 24 * HOUR },
  metadata: { label: 'Q4 Report for review' }
});
// Result: demo.com/files#<token>@<gateway>
```
- Recipient can download the file
- No account needed

### 4. File Share with Account Creation
```typescript
const token = createToken({
  permissions: ['identity:create', 'blob:read', 'blob:write'],
  scope: { blobKey: 'shared/project/*' },  // Prefix access
  constraints: { maxUses: 1 },
  metadata: { label: 'Collaborator invite' }
});
```
- Recipient creates account, then has read/write access to shared folder

## Flow: Token Handling

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Creator (Alice)                                              │
├─────────────────────────────────────────────────────────────────┤
│ • Clicks "Share" in Demo app                                    │
│ • Configures permissions (read, write, delete, etc.)            │
│ • Optionally checks "Allow recipient to create account"         │
│   → This adds IDENTITY_CREATE permission                        │
│ • Sets expiry, adds label ("For Bob")                           │
│ • Gets shareable link                                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Recipient (Bob) opens link                                   │
├─────────────────────────────────────────────────────────────────┤
│ demo.com/chat#<token>@<base64-gateway>                          │
│                                                                 │
│ Demo app detects token in URL fragment                          │
│ Demo calls SDK: sdk.handleToken(token)                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. SDK/Frame inspects token                                     │
├─────────────────────────────────────────────────────────────────┤
│ Frame decodes token, checks permissions:                        │
│                                                                 │
│ IF token has IDENTITY_CREATE:                                   │
│   → Return: { action: 'identity_setup', popupUrl: '...' }       │
│   → Demo opens popup to federise.org/identity/setup             │
│                                                                 │
│ ELSE (only resource permissions):                               │
│   → Return: { action: 'use_token', token }                      │
│   → Demo uses token directly for API access                     │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┴───────────────────┐
          │                                       │
          ▼                                       ▼
┌─────────────────────────┐     ┌─────────────────────────────────┐
│ Direct Token Access     │     │ Identity Setup Popup            │
├─────────────────────────┤     ├─────────────────────────────────┤
│ • Token used as bearer  │     │ • Opens on federise.org         │
│ • Anonymous/pseudonymous│     │ • Bob chooses auth method:      │
│ • Access tied to token  │     │   - Password                    │
│ • Expires with token    │     │   - Passkey                     │
│                         │     │   - OAuth (future)              │
│                         │     │ • Creates identity + credential │
│                         │     │ • Token consumed (maxUses: 1)   │
│                         │     │ • Bob now has persistent auth   │
│                         │     │ • Popup closes, app refreshes   │
└─────────────────────────┘     └─────────────────────────────────┘
```

## Identity Setup Popup

When a token has `IDENTITY_CREATE` permission, the Frame opens a popup on `federise.org`:

```
┌─────────────────────────────────────────┐
│ federise.org/identity/setup             │
├─────────────────────────────────────────┤
│                                         │
│  Welcome!                               │
│  You've been invited by Alice           │
│  Label: "For Bob"                       │
│                                         │
│  ─────────────────────────────────      │
│                                         │
│  Choose how you'll sign in:             │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  🔑  Create a passkey           │    │
│  │      (Recommended)              │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  🔒  Use a password             │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ─────────────────────────────────      │
│                                         │
│  You'll get access to:                  │
│  • #general channel (read, write)       │
│                                         │
│              [ Complete Setup ]         │
│                                         │
└─────────────────────────────────────────┘
```

## Data Model: Token ↔ Identity Relationship

When Bob uses a token to create an identity, we create a bidirectional link:

```
KV Storage:
──────────

# Token record (tracks usage and claims)
__TOKEN:{tokenId} → {
  permissions: [...],
  constraints: { maxUses: 1, usedCount: 1 },
  metadata: { label: "For Bob", createdBy: "alice-identity-id" },
  claims: [
    { identityId: "bob-identity-id", claimedAt: 1705123456789 }
  ]
}

# Identity record (knows its origin)
__IDENTITY:{bob-identity-id} → {
  type: "USER",
  displayName: "Bob",
  createdFromToken: "tokenId",
  createdAt: 1705123456789
}
```

This enables:
- Alice can see: "Bob claimed the 'For Bob' invite"
- Bob's identity knows it originated from an invitation
- Audit trail for access grants

## SDK API

### Creating Tokens
```typescript
// In the SDK
const result = await client.createToken({
  permissions: ['channel:read', 'channel:append', 'identity:create'],
  scope: { channelId: 'abc123' },
  constraints: { expiresAt: Date.now() + 7 * DAY, maxUses: 1 },
  metadata: { label: 'For Bob' }
});

const shareUrl = `${window.location.origin}/chat#${result.token}@${result.gatewayBase64}`;
```

### Handling Tokens (Recipient)
```typescript
// In the demo app, on page load
const tokenFromUrl = extractTokenFromHash();

if (tokenFromUrl) {
  const action = await sdk.handleToken(tokenFromUrl);

  switch (action.type) {
    case 'identity_setup':
      // SDK opens popup automatically, or:
      await sdk.openIdentitySetup(action.popupUrl);
      break;

    case 'use_token':
      // Use token directly for access
      const channelClient = new ChannelClient({ token: action.token });
      break;

    case 'error':
      showError(action.message); // "Token expired", etc.
      break;
  }
}
```

## Migration: Removing Old Systems

### To Remove
1. `invitation.ts` - Separate invitation system
2. `InvitationStatus`, `createInvitation`, `acceptInvitation`, etc.
3. Any invitation-specific endpoints

### To Update
1. Channel token creation - Already uses tokens, add `identity:create` option
2. Blob sharing - Switch from presigned URLs to tokens (for permission-based sharing)
3. SDK - Add `handleToken()` method
4. Frame - Add token inspection and identity setup flow

## Security Considerations

1. **Token Validation**
   - Signature verified on every use
   - Expiry checked
   - `usedCount` incremented and checked against `maxUses`

2. **Identity Creation**
   - Only happens in trusted popup on federise.org
   - Token is consumed (marked as used) atomically with identity creation
   - Credentials never touch the third-party app

3. **Scope Enforcement**
   - Token with `channelId: X` cannot access channel Y
   - Token with `blobKey: foo/*` cannot access `bar/*`

4. **Audit Trail**
   - All token creations logged with creator identity
   - All token claims logged with created identity
   - Enables "who invited whom" queries

## Open Questions

1. **Token encoding**: Current channel tokens use compact binary format. Should unified tokens use the same format or something more extensible (like JWT)?

2. **Permission inheritance**: If Bob creates an identity via invite, do the channel permissions transfer to his identity, or does he need separate grants?

3. **Revocation**: How to revoke a token that's already been shared but not yet used? Need revocation list or token IDs checked against a blocklist?

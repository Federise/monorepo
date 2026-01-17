# apps/demo - Federise Demo Application

## Overview

The Demo application is a Svelte 5 single-page application that showcases the three core Federise capabilities: Notes (KV storage), Files (Blob storage), and Chat (Channel storage). It demonstrates how third-party applications integrate with Federise through the SDK.

## Technical Specifications

| Aspect | Value |
|--------|-------|
| Framework | Svelte 5.2.9 (with runes) |
| Build Tool | Vite 6.0.0 |
| Package | `federise-demo` |
| Entry Point | `src/main.ts` |
| Dev Port | 5175 |
| Deployment | Cloudflare Pages |

## Architecture

### Component Structure

```
src/
├── App.svelte               # Root router
├── main.ts                  # Entry point
├── app.css                  # Global styles
├── components/
│   ├── Sidebar.svelte       # Navigation + connection
│   ├── Settings.svelte      # Frame URL config
│   ├── chat/
│   │   ├── MessageList.svelte    # Chat messages
│   │   ├── MessageInput.svelte   # Message composer
│   │   └── UsernameModal.svelte  # Username prompt
│   └── demos/
│       ├── Notes.svelte     # KV storage demo
│       ├── Files.svelte     # Blob storage demo
│       ├── Chat.svelte      # Channel storage demo
│       └── ChannelView.svelte # Shared channel viewer
├── lib/
│   ├── types.ts             # TypeScript definitions
│   └── chat-utils.ts        # Chat message utilities
└── stores/
    └── federise.svelte.ts   # Reactive state management
```

### Routing System

**Hash-Based Routes:**
```typescript
// App.svelte:17-46
Routes:
├── /           → Notes (default)
├── /#chat      → Chat
├── /#files     → Files
├── /#settings  → Settings
└── /channel#<token>@<base64url_gateway> → ChannelView
```

**Share Link Encoding:**
```typescript
// Chat.svelte:196-203
const base64Gateway = btoa(result.gatewayUrl)
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');
shareUrl = `${baseUrl}/channel#${result.token}@${base64Gateway}`;
```

## State Management

### Svelte 5 Runes Store

```typescript
// stores/federise.svelte.ts
export const connectionState = $state<{ value: ConnectionState }>({
  value: 'disconnected'
});
export const capabilities = $state<{ value: Capability[] }>({
  value: []
});
export const frameUrl = $state<{ value: string }>({
  value: localStorage.getItem(FRAME_URL_KEY) || DEFAULT_FRAME_URL
});
export const error = $state<{ value: string | null }>({
  value: null
});
export const initialized = $state<{ value: boolean }>({
  value: false
});

let client: FederiseClient | null = null;
```

### localStorage Persistence

| Key | Purpose | Default |
|-----|---------|---------|
| `federise-demo:frameUrl` | Frame endpoint | `http://localhost:4321/frame` |
| `federise-demo:lastChannel` | Last selected channel | - |
| `federise-demo:chatUsername` | Chat display name | - |

## Feature Implementations

### Notes Demo (KV Storage)

**Data Model:**
```typescript
interface Note {
  id: string;        // UUID
  title: string;
  content: string;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}
```

**Storage Pattern:** `note:{id}`

**Operations:**
| Action | SDK Method | Key Pattern |
|--------|------------|-------------|
| Create | `client.kv.set()` | `note:{uuid}` |
| Read | `client.kv.get()` | `note:{id}` |
| Update | `client.kv.set()` | `note:{id}` |
| Delete | `client.kv.delete()` | `note:{id}` |
| List | `client.kv.keys('note:')` | Prefix match |

**UI Features:**
- Dual-panel layout (list + editor)
- Mobile-responsive toggle view
- Keyboard shortcut: Ctrl+S to save
- Unsaved changes indicator
- Sort by updatedAt descending

### Files Demo (Blob Storage)

**Operations:**
| Action | SDK Method | Features |
|--------|------------|----------|
| Upload | `client.blob.upload()` | Progress tracking |
| List | `client.blob.list()` | All user blobs |
| Get | `client.blob.get()` | Presigned URL |
| Delete | `client.blob.delete()` | With confirmation |
| Visibility | `client.blob.setVisibility()` | public/presigned/private |

**File Type Support:**
- Images: Preview in modal
- Video/Audio: Native player
- PDF: Link to viewer
- Text/Code: Inline preview
- Archives: Download link

**UI Features:**
- Upload progress bar with phase indicator
- Right-click copy links (presigned/public)
- Preview modal with Escape key close
- Visibility badge with transition spinner

### Chat Demo (Log Storage)

**Channel Structure:**
```typescript
interface Channel extends ChannelMeta {
  channelId: string;
  name: string;
  createdAt?: string;
  secret?: string;  // Only for owner
}
```

**Message Format:**
```typescript
// Regular message
{ type: '__chat__', author: string, text: string }

// Channel metadata
{ type: '__meta__', name: string }
```

**Operations:**
| Action | SDK Method | Notes |
|--------|------------|-------|
| Create | `client.channel.create()` | + meta message |
| List | `client.channel.list()` | User's channels |
| Append | `client.channel.append()` | Chat message |
| Read | `client.channel.read()` | With afterSeq |
| Share | `client.channel.createToken()` | 7-day expiry |
| Delete | `client.channel.delete()` | Owner only |

**Polling System:**
```typescript
// Chat.svelte:149
pollInterval = setInterval(async () => {
  await loadMessages(lastSeq);
}, 3000);  // 3-second interval
```

### Channel View (Shared Access)

**Purpose:** Standalone viewer for shared channels using capability tokens.

**Implementation:**
```typescript
// ChannelView.svelte:30-39
const logClient = new ChannelClient({
  gatewayUrl: props.gatewayUrl,
  token: props.token
});

// No FederiseClient needed - uses token-based ChannelClient
```

**Features:**
- Read-only channel indicator
- Expired/invalid token detection
- Channel name extraction from first meta message
- Same 3-second polling as Chat

## Security Considerations

### XSS Prevention

**Status: Good**
- All user input bound to text content (not innerHTML)
- No `{@html}` directives used
- Message content displayed as plain text

### Token Handling

**Risk:** Tokens visible in URL hash
```
URL: /channel#<token>@<gateway>
```

**Mitigations:**
- URL hash not sent to server (fragment only)
- 7-day expiry on tokens
- Read-only by default

### localStorage Security

**Risk:** XSS could access stored credentials

**Stored Data:**
- Frame URL (low sensitivity)
- Channel ID (low sensitivity)
- Username (low sensitivity)

**Not Stored:**
- API keys (managed by Frame)
- Tokens (in URL only)

## Performance Characteristics

### Polling Overhead

| Component | Interval | Request/Min | Impact |
|-----------|----------|-------------|--------|
| Chat | 3 seconds | 20 | Moderate |
| ChannelView | 3 seconds | 20 | Moderate |

**Total:** Active chat = 40 requests/minute

### Memory Usage

| Feature | Pattern | Concern |
|---------|---------|---------|
| Notes | In-memory array | Scales with note count |
| Files | Metadata only | Low overhead |
| Chat | Message array | Unbounded growth |

### Optimization Opportunities

1. **Message deduplication:** Already implemented (Chat.svelte:116-120)
2. **Virtual scrolling:** Not implemented (needed for long chats)
3. **Lazy loading:** Not implemented for notes list
4. **Adaptive polling:** Could reduce interval when idle

## Build Configuration

### Vite Config

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5175,
    strictPort: true  // Fail if port unavailable
  }
});
```

### TypeScript Config

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ESNext",
    "strict": true,
    "module": "ESNext",
    "checkJs": true,
    "skipLibCheck": true
  }
}
```

## Known Issues

### High Priority

| Issue | Description | Location |
|-------|-------------|----------|
| Race Condition | Rapid channel switching corrupts messages | `Chat.svelte:92-105` |
| No Error Retry | Failed polls silently logged | `Chat.svelte:125-127` |
| Unbounded Messages | No limit on message array size | `Chat.svelte` |

### Medium Priority

| Issue | Description | Location |
|-------|-------------|----------|
| Fixed Poll Interval | 3s not configurable | `Chat.svelte:149` |
| No Offline Mode | No indication when disconnected | `App.svelte` |
| Empty Channel Name | Sanitization can produce empty string | `Chat.svelte:34-40` |
| Download URL Caching | Stale URLs after visibility change | `Files.svelte:95` |

### Low Priority

| Issue | Description | Location |
|-------|-------------|----------|
| Settings Disconnect | No confirmation before disconnect | `Settings.svelte:12-16` |
| Modal Dismiss | No animation on backdrop click | `Chat.svelte:330-332` |
| Anonymous Default | No indication user is anonymous | `Chat.svelte:168-172` |

## Deployment

### Build

```bash
# Development
pnpm dev

# Production build
pnpm build

# Deploy to Cloudflare Pages
pnpm build && wrangler pages deploy dist
```

### Environment

| Variable | Purpose | Default |
|----------|---------|---------|
| Frame URL | Configurable in Settings | `http://localhost:4321/frame` |

**Production Frame URL:** `https://federise.org/frame`

## Dependencies

### Production

| Package | Version | Purpose |
|---------|---------|---------|
| @federise/sdk | workspace:* | Gateway SDK |
| svelte | ^5.2.9 | UI framework |

### Development

| Package | Version | Purpose |
|---------|---------|---------|
| @sveltejs/vite-plugin-svelte | ^5.0.3 | Vite integration |
| typescript | ^5.7.0 | Type checking |
| vite | ^6.0.0 | Build tool |
| wrangler | ^3.97.0 | Deployment |

## Recommendations

### Security

1. Add Referrer-Policy header for shared channels
2. Consider session-based token storage instead of URL
3. Implement content sanitization for chat messages

### Performance

4. Implement virtual scrolling for large message lists
5. Add adaptive polling (longer interval when idle)
6. Implement message pagination instead of loading all

### User Experience

7. Add loading states for all async operations
8. Implement optimistic updates for better responsiveness
9. Add offline indicator with reconnection UI
10. Implement keyboard shortcuts for common actions

# Proxy Package: Extracting Frame Functionality

## Problem Statement

The `/frame` page in `apps/org` contains tightly coupled functionality:
1. **postMessage protocol handling** - routing messages from client apps
2. **Capability enforcement** - permission checks
3. **Storage routing** - forwarding to gateway

This makes it impossible to reuse in other contexts like browser extensions.

## Current Issues

- Can't use in browser extension (no iframe)
- Storage routing hardcoded to remote gateway
- Permission storage tied to org app's cookies/storage
- UI tightly coupled to message handling

## Proposed Package Structure

```
packages/proxy/
├── src/
│   ├── index.ts              # Public exports
│   ├── types.ts              # Shared types
│   ├── router.ts             # Message router (core logic)
│   ├── capabilities.ts       # Capability checking
│   ├── transports/
│   │   ├── postmessage.ts    # iframe postMessage transport
│   │   └── extension.ts      # Browser extension transport
│   └── backends/
│       ├── types.ts          # Backend interface
│       ├── remote.ts         # Remote gateway backend
│       └── local.ts          # Local storage backend
└── package.json
```

## Core Types

```typescript
interface ProxyBackend {
  // KV operations
  kvGet(namespace: string, key: string): Promise<string | null>;
  kvSet(namespace: string, key: string, value: string): Promise<void>;
  kvDelete(namespace: string, key: string): Promise<void>;
  kvKeys(namespace: string, prefix?: string): Promise<string[]>;

  // Blob operations
  blobUpload(namespace: string, key: string, data: ArrayBuffer, options: BlobUploadOptions): Promise<BlobMetadata>;
  blobGet(namespace: string, key: string): Promise<{ url: string; metadata: BlobMetadata }>;
  blobDelete(namespace: string, key: string): Promise<void>;
  blobList(namespace: string): Promise<BlobMetadata[]>;

  // Channel operations
  channelCreate(namespace: string, name: string): Promise<{ metadata: ChannelMetadata; secret: string }>;
  channelAppend(namespace: string, channelId: string, content: string): Promise<ChannelEvent>;
  channelRead(namespace: string, channelId: string, afterSeq?: number, limit?: number): Promise<ChannelReadResult>;
  channelDelete(namespace: string, channelId: string): Promise<void>;
  channelCreateToken(namespace: string, channelId: string, permissions: string[], expiresIn?: number): Promise<TokenResult>;
}

interface CapabilityStore {
  getCapabilities(origin: string): Promise<Capability[]>;
  hasCapability(origin: string, capability: Capability): Promise<boolean>;
  grantCapabilities(origin: string, capabilities: Capability[]): Promise<void>;
  revokeCapabilities(origin: string): Promise<void>;
}

interface MessageRouterOptions {
  backend: ProxyBackend;
  capabilities: CapabilityStore;
  onAuthRequired?: (origin: string, requestedCapabilities: Capability[]) => Promise<void>;
}

interface PostMessageTransportOptions {
  router: MessageRouter;
  onStorageAccessRequired?: () => void;
}

interface ExtensionTransportOptions {
  router: MessageRouter;
}

interface RemoteBackendOptions {
  gatewayUrl: string;
  apiKey: string;
}

interface HybridBackendOptions {
  local: ProxyBackend;
  remote: ProxyBackend;
  strategy: 'local-first' | 'remote-first' | 'offline-only';
}
```

## Migration Path

### Phase 1: Extract to Package
1. Create `packages/proxy` with types and interfaces
2. Move message routing logic from FrameEnforcer to `MessageRouter`
3. Create `PostMessageTransport` wrapping the postMessage listener
4. Create `RemoteBackend` wrapping the current HTTP client logic

### Phase 2: Update apps/org
Update FrameEnforcer.svelte to use the new proxy package with CookieCapabilityStore

### Phase 3: Browser Extension
Create extension using ExtensionTransport with ExtensionCapabilityStore and optional popup UI for capability approval

### Phase 4: Hybrid Backend
Support combining local and remote backends with configurable strategy

## Extension Architecture

Background Service Worker contains:
- ExtensionTransport (chrome.runtime.onMessage)
- MessageRouter (permission checks, routing)
- LocalBackend (IndexedDB) and/or RemoteBackend (HTTP)

Popup UI handles:
- Capability approval prompts
- Gateway configuration
- Status display

Content Script handles:
- SDK shim injection for apps without SDK
- Page ↔ extension message bridging

## Capability Store Implementations

| Context | Storage | Implementation |
|---------|---------|----------------|
| iframe (org app) | Cookies (same-origin) | `CookieCapabilityStore` |
| Extension | chrome.storage.local | `ExtensionCapabilityStore` |
| Local-only | IndexedDB | `IndexedDBCapabilityStore` |

## Benefits

1. **Code Reuse**: Same routing logic for iframe and extension
2. **Testability**: MessageRouter can be unit tested with mock backends
3. **Flexibility**: Swap backends (remote, local, hybrid) without changing routing
4. **Separation of Concerns**: Transport layer decoupled from business logic
5. **Extension Support**: First-class support for browser extension deployment

## Open Questions

1. **Extension messaging protocol**: Use same protocol as postMessage, or extension-specific?
2. **Content script injection**: Automatic for known apps, or opt-in?
3. **Cross-browser support**: Chrome, Firefox, Safari - use WebExtension polyfill?
4. **Popup vs sidebar**: Extension UI for capability approval?

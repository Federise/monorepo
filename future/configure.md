# Capability Provider Configuration

## Vision

Users can mix and match capability providers:
- KV stored locally in browser (IndexedDB)
- Blobs on a self-hosted MinIO server
- Logs on Cloudflare with Durable Objects

Different apps can be configured to use different providers for the same capability.

## Core Concepts

### Provider

A **Provider** is an endpoint that implements one or more capabilities.

```typescript
interface Provider {
  id: string;                    // Unique identifier: "local", "cf-prod", "self-hosted-1"
  name: string;                  // Display name: "Local Browser Storage"
  type: 'local' | 'remote';      // Local (browser) or remote (HTTP)
  capabilities: Capability[];    // What it provides: ['kv:read', 'kv:write', 'blob:read']
  config: ProviderConfig;        // Connection details
}

type ProviderConfig =
  | { type: 'local' }
  | { type: 'remote'; gatewayUrl: string; apiKey: string };
```

### Capability Route

A **CapabilityRoute** maps a capability to a provider.

```typescript
interface CapabilityRoute {
  capability: Capability;
  providerId: string;
  priority?: number;             // For fallback chains
}
```

### App Configuration

Each app origin can have its own routing configuration.

```typescript
interface AppConfig {
  origin: string;                // "https://myapp.example.com"
  routes: CapabilityRoute[];     // How capabilities are routed for this app
  defaultProviderId?: string;    // Fallback provider
}
```

## Architecture

- **User Configuration** contains Provider Registry and App Routing Configurations
- **Provider Registry** holds multiple providers (local, cf-prod, self-hosted-1, etc.)
- **App Routing Configurations** map capabilities to providers per-app
- **Routing Proxy** contains CapabilityRouter that resolves providers and routes requests
- CapabilityRouter delegates to LocalProvider (IndexedDB) or RemoteProvider (HTTP)

## Provider Interface

```typescript
interface ProviderCapabilities {
  kv?: {
    get(namespace: string, key: string): Promise<string | null>;
    set(namespace: string, key: string, value: string): Promise<void>;
    delete(namespace: string, key: string): Promise<void>;
    keys(namespace: string, prefix?: string): Promise<string[]>;
  };
  blob?: {
    upload(namespace: string, key: string, data: ArrayBuffer, options: BlobOptions): Promise<BlobMetadata>;
    get(namespace: string, key: string): Promise<BlobResult>;
    delete(namespace: string, key: string): Promise<void>;
    list(namespace: string): Promise<BlobMetadata[]>;
    setVisibility(namespace: string, key: string, visibility: BlobVisibility): Promise<BlobMetadata>;
  };
  log?: {
    create(namespace: string, name: string): Promise<LogCreateResult>;
    append(namespace: string, logId: string, content: string): Promise<LogEvent>;
    read(namespace: string, logId: string, afterSeq?: number, limit?: number): Promise<LogReadResult>;
    delete(namespace: string, logId: string): Promise<void>;
    createToken(namespace: string, logId: string, perms: string[], expiresIn?: number): Promise<TokenResult>;
    subscribe?(namespace: string, logId: string): AsyncIterable<LogEvent>;
  };
}

interface IProvider {
  readonly id: string;
  readonly name: string;
  readonly type: 'local' | 'remote';

  getCapabilities(): Promise<Capability[]>;
  hasCapability(capability: Capability): Promise<boolean>;

  getKV?(): ProviderCapabilities['kv'];
  getBlob?(): ProviderCapabilities['blob'];
  getLog?(): ProviderCapabilities['log'];

  ping(): Promise<boolean>;
}
```

## Storage Interfaces

```typescript
interface ProviderRegistryStorage {
  load(): Promise<ProviderDefinition[]>;
  save(providers: ProviderDefinition[]): Promise<void>;
}

interface CapabilityRouterStorage {
  loadAppConfig(origin: string): Promise<AppRouteConfig | null>;
  saveAppConfig(config: AppRouteConfig): Promise<void>;
  loadDefaultConfig(): Promise<RouteConfig[]>;
  saveDefaultConfig(routes: RouteConfig[]): Promise<void>;
}
```

## Configuration Storage Options

| Context | Storage | Notes |
|---------|---------|-------|
| Org app (iframe) | Cookies + localStorage | Same-origin with org |
| Extension | chrome.storage.sync | Synced across devices |
| Local-only | IndexedDB | Browser local storage |

## Configuration UI

### Provider Management
- List all providers (built-in local + user-configured remote)
- Add/edit/remove providers
- Show status and capabilities per provider

### App Routing Configuration
- Per-capability provider selection with fallback options
- Default provider selection
- Save configuration

### Quick Presets
- **Local Only**: All data in browser, works offline
- **Cloud**: All data synced to Cloudflare gateway
- **Hybrid**: Fast local with cloud backup
- **Self-Hosted**: Data on user's infrastructure
- **Custom**: Configure each capability individually

## Provider Composition

### Tiered Storage

Route based on data characteristics (size, access patterns).

```typescript
interface TieredProviderOptions {
  hot: IProvider;      // Fast, expensive (local, edge)
  warm: IProvider;     // Medium (regional)
  cold: IProvider;     // Slow, cheap (S3 glacier)
  policy: TieringPolicy;
}
```

### Replicated Storage

Write to multiple providers for redundancy.

```typescript
interface ReplicatedProviderOptions {
  primary: IProvider;
  replicas: IProvider[];
  readStrategy: 'primary' | 'fastest' | 'quorum';
  writeStrategy: 'sync' | 'async';
}
```

### Encrypted Provider Wrapper

Encrypt data before storing on inner provider.

## Data Model

```typescript
interface FederiseConfig {
  version: number;

  // Registered providers
  providers: ProviderDefinition[];

  // Default routing (applies to all apps unless overridden)
  defaultRoutes: RouteConfig[];
  defaultProviderId: string;

  // Per-app overrides
  apps: {
    [origin: string]: {
      routes: RouteConfig[];
      defaultProviderId?: string;
      capabilities: Capability[];
      grantedAt: string;
    };
  };
}

interface ProviderDefinition {
  id: string;
  name: string;
  type: 'local' | 'remote';
  config:
    | { type: 'local' }
    | {
        type: 'remote';
        gatewayUrl: string;
        apiKey: string;
        capabilities?: Capability[];
      };
  enabled: boolean;
  createdAt: string;
}

interface RouteConfig {
  capability: string;  // Capability or pattern ("kv:*", "blob:read")
  providerId: string;
  priority: number;    // Lower = higher priority
}
```

## Migration from Current System

### Phase 1: Add Provider Abstraction
1. Create `IProvider` interface
2. Wrap existing `RemoteBackend` as a provider
3. Create `LocalProvider` using `@federise/local`
4. Default config: single provider (current behavior)

### Phase 2: Add Routing Layer
1. Implement `CapabilityRouter`
2. Add default route config (all → existing gateway)
3. Update `MessageRouter` to use `CapabilityRouter`

### Phase 3: Add Configuration UI
1. Provider management in org app settings
2. Per-app routing configuration
3. Presets for common setups

### Phase 4: Extension Support
1. Port config storage to `chrome.storage.sync`
2. Add provider management to extension popup
3. Support per-app routing in extension

## Open Questions

1. **Capability discovery**: Should remote providers expose `/capabilities` endpoint?
2. **Migration between providers**: How to move data from one provider to another?
3. **Quota management**: Track usage per provider?
4. **Conflict resolution**: When same data exists on multiple providers?
5. **Credential management**: Secure storage for multiple API keys?
6. **Offline behavior**: Queue writes to unavailable providers?

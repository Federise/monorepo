# Federise Developer Integration Guide

This guide explains how to integrate Federise into your web application to provide secure, permission-based data storage for your users.

## Table of Contents

- [What is Federise?](#what-is-federise)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Basic Usage](#basic-usage)
- [Capabilities](#capabilities)
- [KV Storage API](#kv-storage-api)
- [Permission Flow](#permission-flow)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)
- [Advanced Usage](#advanced-usage)
- [Troubleshooting](#troubleshooting)
- [API Reference](#api-reference)

---

## What is Federise?

Federise is a secure data storage platform that allows your web application to store user data without managing your own backend infrastructure. Key benefits:

- **Privacy-first:** Data belongs to users, not applications
- **Permission-based:** Users explicitly grant capabilities
- **Cross-origin secure:** Uses iframe isolation
- **Offline support:** Works offline with localStorage fallback
- **Zero backend:** No server required for your app

### How It Works

```
Your Application
      │
      ▼
┌─────────────────┐
│  @federise/sdk  │  ← You integrate this
└────────┬────────┘
         │ postMessage
         ▼
┌─────────────────┐
│ Federise Frame  │  ← Secure iframe
│ (federise.org)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  User's Data    │  ← Stored securely
└─────────────────┘
```

---

## Quick Start

### 1. Install the SDK

```bash
npm install @federise/sdk
# or
pnpm add @federise/sdk
# or
yarn add @federise/sdk
```

### 2. Connect and Use

```typescript
import { FederiseClient } from '@federise/sdk';

async function main() {
  // Create client
  const federise = new FederiseClient();

  // Connect to Federise
  await federise.connect();

  // Request storage permissions
  await federise.requestCapabilities(['kv:read', 'kv:write']);

  // Store data
  await federise.kv.set('user:preferences', JSON.stringify({
    theme: 'dark',
    language: 'en'
  }));

  // Retrieve data
  const prefs = await federise.kv.get('user:preferences');
  console.log(JSON.parse(prefs!));

  // Clean up
  federise.disconnect();
}

main();
```

---

## Installation

### NPM/Yarn/pnpm

```bash
npm install @federise/sdk
```

### CDN (ES Modules)

```html
<script type="module">
  import { FederiseClient } from 'https://unpkg.com/@federise/sdk';
  // ...
</script>
```

### TypeScript Support

The SDK includes TypeScript definitions. No additional `@types` package needed.

```typescript
import { FederiseClient, Capability, FederiseError } from '@federise/sdk';
```

---

## Basic Usage

### Creating a Client

```typescript
import { FederiseClient } from '@federise/sdk';

// Default configuration
const client = new FederiseClient();

// Custom configuration
const client = new FederiseClient({
  frameUrl: 'https://federise.org/frame',  // Default
  timeout: 30000,                           // 30s default
});
```

### Connection Lifecycle

```typescript
// Connect (creates hidden iframe)
await client.connect();

// Check connection status
if (client.isConnected()) {
  // Use the client
}

// Disconnect (cleans up iframe and listeners)
client.disconnect();
```

### Requesting Capabilities

Before using storage, request the capabilities you need:

```typescript
const result = await client.requestCapabilities(['kv:read', 'kv:write']);

if (result.granted) {
  console.log('Capabilities granted:', result.capabilities);
} else {
  console.log('Pending capabilities:', result.pending);
}
```

**Important:** This may open a popup for user authorization. Handle popup blockers gracefully.

---

## Capabilities

Capabilities are permissions that users grant to your application.

| Capability | Description | Use Case |
|------------|-------------|----------|
| `kv:read` | Read from key-value storage | Loading user preferences |
| `kv:write` | Write to key-value storage | Saving user data |
| `kv:delete` | Delete from key-value storage | Removing stored items |
| `blob:read` | Read binary files | Loading user files |
| `blob:write` | Write binary files | Uploading user files |
| `notifications` | Send notifications | Alert users |

### Checking Granted Capabilities

```typescript
// Get all currently granted capabilities
const caps = client.getGrantedCapabilities();
console.log(caps); // ['kv:read', 'kv:write']

// Check for specific capability
function hasCapability(cap: Capability): boolean {
  return client.getGrantedCapabilities().includes(cap);
}
```

### Requesting Additional Capabilities

You can request more capabilities at any time:

```typescript
// Already have kv:read, kv:write
// Now need delete capability
await client.requestCapabilities(['kv:read', 'kv:write', 'kv:delete']);
```

---

## KV Storage API

Key-value storage for string data.

### Set a Value

```typescript
await client.kv.set('key', 'value');

// Store objects as JSON
await client.kv.set('user:settings', JSON.stringify({
  theme: 'dark',
  fontSize: 16
}));
```

**Requirements:** `kv:write` capability

### Get a Value

```typescript
const value = await client.kv.get('key');

if (value !== null) {
  console.log('Found:', value);
} else {
  console.log('Key not found');
}

// Parse JSON data
const settings = JSON.parse(await client.kv.get('user:settings') ?? '{}');
```

**Requirements:** `kv:read` capability

### Delete a Value

```typescript
await client.kv.delete('key');
```

**Requirements:** `kv:delete` capability

### List Keys

```typescript
// List all keys
const allKeys = await client.kv.keys();

// List keys with prefix
const userKeys = await client.kv.keys('user:');
console.log(userKeys); // ['user:settings', 'user:profile', ...]
```

**Requirements:** `kv:read` capability

### Key Naming Conventions

Use namespaced keys to organize data:

```
app:config          - Application configuration
user:profile        - User profile data
user:settings       - User preferences
cache:api:users     - Cached API responses
session:token       - Session data
```

---

## Permission Flow

### Standard Flow

When you request capabilities, Federise handles the authorization:

```typescript
try {
  const result = await client.requestCapabilities(['kv:read', 'kv:write']);
  // User has granted permissions
} catch (error) {
  if (error.code === 'POPUP_BLOCKED') {
    // Show user a message to allow popups
  } else if (error.code === 'PERMISSION_DENIED') {
    // User denied the request
  }
}
```

### What Users See

1. **First request:** Authorization popup opens
2. **User reviews:** List of requested capabilities displayed
3. **User decides:** Grant or deny
4. **Result returned:** Your app receives the result

### Popup Handling

```typescript
async function requestWithFallback(caps: Capability[]) {
  try {
    return await client.requestCapabilities(caps);
  } catch (error) {
    if (error.code === 'POPUP_BLOCKED') {
      // Show manual button
      showMessage('Please click the button to authorize');
      return null;
    }
    throw error;
  }
}
```

---

## Error Handling

### Error Types

```typescript
import {
  FederiseError,
  PermissionDeniedError,
  TimeoutError,
  ConnectionError
} from '@federise/sdk';
```

### Handling Errors

```typescript
try {
  await client.kv.set('key', 'value');
} catch (error) {
  if (error instanceof PermissionDeniedError) {
    // Missing capability
    console.log(`Need ${error.capability} permission`);
    await client.requestCapabilities([error.capability]);
  } else if (error instanceof TimeoutError) {
    // Request took too long
    console.log('Request timed out, please try again');
  } else if (error instanceof ConnectionError) {
    // Connection issue
    console.log('Connection error:', error.message);
    await client.connect(); // Reconnect
  } else if (error instanceof FederiseError) {
    // Other Federise error
    console.log(`Error [${error.code}]: ${error.message}`);
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `PERMISSION_DENIED` | Operation requires missing capability |
| `TIMEOUT` | Request exceeded timeout |
| `CONNECTION_ERROR` | Failed to connect or disconnected |
| `POPUP_BLOCKED` | Browser blocked authorization popup |
| `UNKNOWN` | Unexpected error |

---

## Best Practices

### 1. Request Minimal Capabilities

Only request what you need:

```typescript
// Bad: Request everything
await client.requestCapabilities([
  'kv:read', 'kv:write', 'kv:delete',
  'blob:read', 'blob:write', 'notifications'
]);

// Good: Request only what's needed
await client.requestCapabilities(['kv:read', 'kv:write']);
```

### 2. Handle Missing Permissions Gracefully

```typescript
async function saveData(key: string, value: string) {
  const caps = client.getGrantedCapabilities();

  if (!caps.includes('kv:write')) {
    // Offer to request permission
    const granted = await requestWritePermission();
    if (!granted) {
      showNotification('Cannot save without permission');
      return false;
    }
  }

  await client.kv.set(key, value);
  return true;
}
```

### 3. Use Structured Key Names

```typescript
// Create a key namespace for your app
const NAMESPACE = 'myapp';

function key(name: string): string {
  return `${NAMESPACE}:${name}`;
}

await client.kv.set(key('settings'), value);
await client.kv.get(key('profile'));
```

### 4. Handle Offline Scenarios

```typescript
async function loadWithFallback(key: string, defaultValue: string) {
  try {
    const value = await client.kv.get(key);
    return value ?? defaultValue;
  } catch (error) {
    if (error instanceof TimeoutError || error instanceof ConnectionError) {
      // Return cached/default value when offline
      return localStorage.getItem(`cache:${key}`) ?? defaultValue;
    }
    throw error;
  }
}
```

### 5. Clean Up on Unmount

```typescript
// React example
useEffect(() => {
  const client = new FederiseClient();

  client.connect().then(() => {
    // Ready to use
  });

  return () => {
    client.disconnect();
  };
}, []);
```

---

## Advanced Usage

### Custom Frame URL (Development)

For local development, point to your local frame:

```typescript
const client = new FederiseClient({
  frameUrl: 'http://localhost:4321/frame'
});
```

### Extended Timeouts

For slow connections:

```typescript
const client = new FederiseClient({
  timeout: 60000  // 60 seconds
});
```

### Batch Operations

Store related data together:

```typescript
// Instead of multiple calls
await client.kv.set('user:name', 'Alice');
await client.kv.set('user:email', 'alice@example.com');
await client.kv.set('user:avatar', 'https://...');

// Better: Store as single object
await client.kv.set('user:profile', JSON.stringify({
  name: 'Alice',
  email: 'alice@example.com',
  avatar: 'https://...'
}));
```

### Data Migration

```typescript
async function migrateData() {
  // Check for old data format
  const oldData = await client.kv.get('settings');

  if (oldData) {
    // Migrate to new format
    const parsed = JSON.parse(oldData);
    await client.kv.set('v2:settings', JSON.stringify({
      ...parsed,
      version: 2,
      migratedAt: Date.now()
    }));

    // Remove old data
    await client.kv.delete('settings');
  }
}
```

### React Hook Example

```typescript
import { useState, useEffect, useCallback } from 'react';
import { FederiseClient, Capability } from '@federise/sdk';

export function useFederise() {
  const [client] = useState(() => new FederiseClient());
  const [connected, setConnected] = useState(false);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);

  useEffect(() => {
    client.connect()
      .then(() => {
        setConnected(true);
        setCapabilities(client.getGrantedCapabilities());
      })
      .catch(console.error);

    return () => client.disconnect();
  }, [client]);

  const requestCapabilities = useCallback(async (caps: Capability[]) => {
    const result = await client.requestCapabilities(caps);
    setCapabilities(client.getGrantedCapabilities());
    return result;
  }, [client]);

  return {
    client,
    connected,
    capabilities,
    requestCapabilities
  };
}

// Usage
function MyComponent() {
  const { client, connected, requestCapabilities } = useFederise();

  if (!connected) return <div>Connecting...</div>;

  return <div>Connected!</div>;
}
```

### Vue Composable Example

```typescript
import { ref, onMounted, onUnmounted } from 'vue';
import { FederiseClient, Capability } from '@federise/sdk';

export function useFederise() {
  const client = new FederiseClient();
  const connected = ref(false);
  const capabilities = ref<Capability[]>([]);

  onMounted(async () => {
    await client.connect();
    connected.value = true;
    capabilities.value = client.getGrantedCapabilities();
  });

  onUnmounted(() => {
    client.disconnect();
  });

  async function requestCapabilities(caps: Capability[]) {
    const result = await client.requestCapabilities(caps);
    capabilities.value = client.getGrantedCapabilities();
    return result;
  }

  return {
    client,
    connected,
    capabilities,
    requestCapabilities
  };
}
```

---

## Troubleshooting

### "Connection timeout"

**Cause:** Frame didn't load or initialize

**Solutions:**
1. Check network connectivity
2. Verify `frameUrl` is correct
3. Check browser console for errors
4. Ensure popups aren't blocked

### "Popup blocked"

**Cause:** Browser blocked authorization popup

**Solutions:**
1. Trigger from user interaction (click handler)
2. Guide users to allow popups
3. Provide manual authorization fallback

```typescript
// Must be called from user interaction
button.addEventListener('click', async () => {
  await client.requestCapabilities(['kv:read']);
});
```

### "Permission denied"

**Cause:** Operation requires missing capability

**Solutions:**
1. Check granted capabilities before operation
2. Request needed capabilities
3. Handle denial gracefully

### "Request timed out"

**Cause:** Operation took too long

**Solutions:**
1. Increase timeout in options
2. Check network connectivity
3. Retry with exponential backoff

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof TimeoutError && i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}
```

### Data Not Persisting

**Cause:** Permissions revoked or localStorage cleared

**Solutions:**
1. Check capability status
2. Handle storage errors
3. Sync critical data to server

---

## API Reference

### FederiseClient

```typescript
class FederiseClient {
  constructor(options?: FederiseClientOptions);

  // Connection
  connect(): Promise<void>;
  disconnect(): void;
  isConnected(): boolean;

  // Capabilities
  getGrantedCapabilities(): Capability[];
  requestCapabilities(capabilities: Capability[]): Promise<GrantResult>;

  // KV Storage
  kv: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
    keys(prefix?: string): Promise<string[]>;
  };
}
```

### FederiseClientOptions

```typescript
interface FederiseClientOptions {
  frameUrl?: string;   // Default: 'https://federise.org/frame'
  timeout?: number;    // Default: 30000 (30 seconds)
}
```

### Capability

```typescript
type Capability =
  | 'kv:read'
  | 'kv:write'
  | 'kv:delete'
  | 'blob:read'
  | 'blob:write'
  | 'notifications';
```

### GrantResult

```typescript
interface GrantResult {
  granted: boolean;
  capabilities: Capability[];
  pending: Capability[];
}
```

### Error Classes

```typescript
class FederiseError extends Error {
  code: string;
}

class PermissionDeniedError extends FederiseError {
  capability: Capability;
}

class TimeoutError extends FederiseError {}

class ConnectionError extends FederiseError {}
```

---

## Support

- **GitHub Issues:** [github.com/Federise/monorepo/issues](https://github.com/Federise/monorepo/issues)
- **Documentation:** [federise.org/docs](https://federise.org/docs)

---

## License

MIT License - See LICENSE file for details.

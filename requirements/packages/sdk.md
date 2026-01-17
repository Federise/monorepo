# packages/sdk - Federise Client SDK

## Overview

The Federise SDK provides client libraries for accessing Federise services from browser and Node.js applications. It includes two clients: FederiseClient (iframe-based, full-featured) and ChannelClient (token-based, lightweight).

## Technical Specifications

| Aspect | Value |
|--------|-------|
| Package | `@federise/sdk` |
| Type | ES Module |
| Target | ES2020 |
| Bundle Size | ~18-22KB minified, ~5-7KB gzipped |
| Dependencies | Zero runtime dependencies |

## Architecture

### Module Structure

```
src/
├── index.ts          # Public exports (32 lines)
├── client.ts         # FederiseClient (887 lines)
├── channel-client.ts     # ChannelClient (292 lines)
└── types.ts          # Type definitions (193 lines)

Total: ~1,404 lines
```

### Client Comparison

| Aspect | FederiseClient | ChannelClient |
|--------|----------------|-----------|
| Transport | iframe + postMessage | Direct HTTP |
| Auth | Capability-based | Token-based |
| Operations | All (KV, Blob, Channel) | Channel only |
| Environment | Browser only | Browser + Node.js |
| State | Connected session | Stateless |
| Bundle Impact | ~15KB | ~8KB |

## FederiseClient

### Initialization

```typescript
const client = new FederiseClient({
  frameUrl: 'https://federise.org/frame',  // Required
  timeout: 30000  // Optional, default 30s
});

// Connect to frame
await client.connect();

// Request capabilities
const result = await client.requestCapabilities([
  'kv:read',
  'kv:write',
  'blob:read'
]);
```

### Connection Lifecycle

```
new FederiseClient(options)
        ↓
client.connect()
        ↓
Create hidden iframe (sandbox)
        ↓
Wait for frame load
        ↓
Wait for READY signal
        ↓
Send SYN message
        ↓
Receive ACK with capabilities
        ↓
Connected state
        ↓
client.disconnect()
        ↓
Cleanup (remove listeners, iframe)
```

### Namespace APIs

#### KV Namespace

```typescript
interface KVNamespace {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  keys(prefix?: string): Promise<string[]>;
}

// Usage
const value = await client.kv.get('mykey');
await client.kv.set('mykey', 'myvalue');
await client.kv.delete('mykey');
const keys = await client.kv.keys('prefix:');
```

**Required Capabilities:**
- `kv:read` for get, keys
- `kv:write` for set
- `kv:delete` for delete

#### Blob Namespace

```typescript
interface BlobNamespace {
  upload(file: File, options?: UploadOptions): Promise<BlobMetadata>;
  get(key: string): Promise<BlobGetResult>;
  delete(key: string): Promise<void>;
  list(): Promise<BlobMetadata[]>;
  setVisibility(key: string, visibility: BlobVisibility): Promise<void>;
}

interface UploadOptions {
  visibility?: BlobVisibility;
  onProgress?: (progress: UploadProgress) => void;
}

interface UploadProgress {
  phase: 'uploading';
  loaded: number;
  total: number;
  percentage: number;
}

// Usage
const metadata = await client.blob.upload(file, {
  visibility: 'public',
  onProgress: (p) => console.log(`${p.percentage}%`)
});
```

**Upload Strategy:**
1. Try presigned URL (preferred)
   - XHR for streaming progress
   - Direct upload to R2/S3
2. Fallback to iframe upload
   - Chunked file reading (5MB chunks)
   - Memory-bounded

#### Channel Namespace

```typescript
interface ChannelNamespace {
  create(name: string): Promise<ChannelCreateResult>;
  list(): Promise<ChannelMeta[]>;
  append(channelId: string, content: string): Promise<ChannelEvent>;
  read(channelId: string, afterSeq?: number, limit?: number): Promise<ChannelReadResult>;
  delete(channelId: string): Promise<void>;
  createToken(
    channelId: string,
    permissions: ('read' | 'write')[],
    expiresInSeconds?: number
  ): Promise<{ token: string; expiresAt: string; gatewayUrl: string }>;
}

// Usage
const { metadata, secret } = await client.channel.create('My Channel');
await client.channel.append(metadata.channelId, 'Hello world');
const { events, hasMore } = await client.channel.read(metadata.channelId, 0, 50);
```

### Error Handling

```typescript
// Error classes
class FederiseError extends Error {
  code: string;
}

class PermissionDeniedError extends FederiseError {
  capability: string;
}

class TimeoutError extends FederiseError {}

class ConnectionError extends FederiseError {}

// Usage
try {
  await client.kv.get('key');
} catch (e) {
  if (e instanceof PermissionDeniedError) {
    console.log(`Need capability: ${e.capability}`);
  }
}
```

### Internal Implementation

#### Message Handling

```typescript
// Request ID generation (client.ts:29-31)
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// Pending request tracking
private pendingRequests = new Map<string, {
  resolve: (response: ResponseMessage) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}>();
```

#### Upload Implementation

```typescript
// Presigned URL path (preferred)
private async uploadWithPresignedUrl(file: File, options): Promise<void> {
  const { uploadUrl } = await this.getPresignedUploadUrl(file);
  return this.uploadFileWithXHR(file, uploadUrl, options.onProgress);
}

// XHR for streaming (client.ts:737-790)
private uploadFileWithXHR(file: File, url: string, onProgress?): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress({
          phase: 'uploading',
          loaded: e.loaded,
          total: e.total,
          percentage: Math.round((e.loaded / e.total) * 100)
        });
      }
    });
    xhr.open('PUT', url);
    xhr.send(file);  // Streams without loading into memory
  });
}
```

## ChannelClient

### Purpose

Lightweight client for token-based channel access without iframe dependency. Used by recipients accessing shared channels.

### Initialization

```typescript
// From capability token
const logClient = new ChannelClient({
  gatewayUrl: 'https://gateway.federise.org',
  token: 'AbCdEf...'  // V1, V2, or V3 format
});

// Properties (readonly)
logClient.channelId      // Extracted from token
logClient.authorId   // Client identifier
logClient.canRead    // Boolean
logClient.canWrite   // Boolean
logClient.isExpired  // Boolean
logClient.expiresAt  // Date
```

### Operations

```typescript
// Read events
const result = await logClient.read(afterSeq?, limit?);
// Returns: { events: ChannelEvent[], hasMore: boolean }

// Append event
const event = await logClient.append('Hello world');
// Returns: ChannelEvent
```

### Token Parsing

```typescript
// Token format detection (channel-client.ts:156-292)
private parseToken(token: string): TokenData {
  const bytes = base64urlDecode(token);

  if (bytes[0] === 0x03) {
    // V3: Ultra-compact format
    return this.parseV3Token(bytes);
  } else if (bytes[0] === 0x02) {
    // V2: Compact binary format
    return this.parseV2Token(bytes);
  } else {
    // V1: JSON format
    return this.parseV1Token(token);
  }
}
```

## Type Definitions

### Capabilities

```typescript
type Capability =
  | 'kv:read'
  | 'kv:write'
  | 'kv:delete'
  | 'blob:read'
  | 'blob:write'
  | 'channel:create'
  | 'channel:delete'
  | 'notifications';
```

### Blob Types

```typescript
type BlobVisibility = 'public' | 'presigned' | 'private';

interface BlobMetadata {
  key: string;
  namespace: string;
  size: number;
  contentType: string;
  uploadedAt: string;
  visibility: BlobVisibility;
}

interface BlobGetResult {
  url: string;
  metadata: BlobMetadata;
  expiresAt?: string;
}
```

### Log Types

```typescript
interface ChannelMeta {
  channelId: string;
  name: string;
  createdAt?: string;
}

interface ChannelCreateResult {
  metadata: ChannelMeta;
  secret: string;
}

interface ChannelEvent {
  id: string;
  seq: number;
  authorId: string;
  content: string;
  createdAt: string;
}

interface ChannelReadResult {
  events: ChannelEvent[];
  hasMore: boolean;
}
```

### Protocol Types

```typescript
interface RequestMessage {
  id: string;
  type: string;
  // ... operation-specific fields
}

interface ResponseMessage {
  id: string;
  type: string;
  // ... response-specific fields
}
```

## Browser vs Node.js

### Browser-Only Features

| Feature | Location | Reason |
|---------|----------|--------|
| HTMLIFrameElement | client.ts:34 | DOM required |
| window.addEventListener | client.ts:91 | Browser events |
| document.createElement | client.ts:74 | DOM manipulation |
| window.open | client.ts:220 | Auth popup |
| File API | client.ts:807 | File handling |

### Node.js Compatible

| Feature | Location | Notes |
|---------|----------|-------|
| ChannelClient | channel-client.ts | Full functionality |
| Token parsing | channel-client.ts:156 | No DOM needed |
| Fetch API | channel-client.ts | Node 18+ |

**Note:** `atob`/`btoa` may need polyfill in older Node.js versions.

## Performance Characteristics

### Connection Overhead

| Phase | Typical Time |
|-------|--------------|
| Iframe load | 50-200ms |
| Frame ready | 50-100ms |
| SYN/ACK handshake | 20-50ms |
| Total connect | 120-350ms |

### Request Latency

| Operation | Typical Time | Factors |
|-----------|--------------|---------|
| KV get | 30-80ms | KV lookup |
| KV set | 40-100ms | KV write |
| Blob upload (small) | 100-300ms | Upload + metadata |
| Blob upload (large) | Variable | File size |
| Channel append | 60-150ms | DO coordination |

### Memory Efficiency

| Pattern | Memory Usage |
|---------|--------------|
| Single KV get | Minimal (string) |
| Presigned upload | Streaming (no buffering) |
| Iframe upload | 5MB chunks |
| Channel read | Per-event objects |

## Security Considerations

### Iframe Sandbox

```typescript
// client.ts:87
iframe.sandbox.add(
  'allow-scripts',
  'allow-same-origin',
  'allow-storage-access-by-user-activation'
);
```

### Origin Validation

```typescript
// client.ts:680
if (event.source !== this.iframe?.contentWindow) {
  return;  // Ignore messages from wrong source
}
```

### Target Origin

```typescript
// client.ts:711
source.postMessage(message, { targetOrigin: origin });
```

## Known Issues

### Limitations

| Issue | Description | Impact |
|-------|-------------|--------|
| No retry logic | Single attempt per operation | Reliability |
| No concurrent limits | Could overwhelm frame | Performance |
| No cancellation | Can't abort uploads | UX |
| No batch operations | Individual roundtrips | Overhead |
| No caching | Every operation hits frame | Performance |

### Edge Cases

| Issue | Description | Location |
|-------|-------------|----------|
| File staleness | Long reads may fail | client.ts:793-796 |
| Firefox 2GB limit | ArrayBuffer size limit | client.ts:361-363 |
| KV propagation | 500ms delay after auth | client.ts:238 |
| Popup blocking | Auth requires popup | client.ts:226-230 |

## Exported API

```typescript
// index.ts
export { FederiseClient } from './client';
export { ChannelClient } from './channel-client';

export type {
  Capability,
  BlobMetadata,
  BlobVisibility,
  ChannelEvent,
  ChannelMeta,
  ChannelCreateResult,
  ChannelReadResult,
  UploadProgress,
  UploadOptions,
  RequestMessage,
  ResponseMessage,
  FederiseClientOptions,
  GrantResult
};

export {
  FederiseError,
  PermissionDeniedError,
  TimeoutError,
  ConnectionError
};
```

## TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "dist"
  }
}
```

## Recommendations

### Reliability

1. Add request retry with exponential backoff
2. Implement request queuing/rate limiting
3. Add cancellation support for uploads

### Performance

4. Add client-side caching layer
5. Implement batch operations
6. Support request deduplication

### Developer Experience

7. Add comprehensive TypeScript types
8. Improve error messages with context
9. Add debug logging option

### Security

10. Implement secure token storage
11. Add token refresh mechanism
12. Consider request signing for sensitive operations

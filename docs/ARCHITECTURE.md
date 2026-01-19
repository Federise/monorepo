# Federise Architecture

This document provides a comprehensive overview of the Federise monorepo architecture, including all applications, packages, and how they work together.

## Table of Contents

- [Overview](#overview)
- [Monorepo Structure](#monorepo-structure)
- [Apps](#apps)
  - [Org App](#org-app)
  - [Gateway](#gateway)
- [Packages](#packages)
  - [SDK](#sdk)
- [Data Flow](#data-flow)
- [Communication Protocol](#communication-protocol)
- [Security Model](#security-model)
- [Storage Architecture](#storage-architecture)
- [Testing](#testing)
- [Build & Deployment](#build--deployment)

---

## Overview

Federise is a platform that allows third-party applications to store and retrieve data through a controlled iframe-based interface. The architecture follows a security-first design where:

1. **Host applications** never directly access storage or hold tokens/secrets
2. **All operations** go through a permission-controlled frame
3. **Users explicitly grant** capabilities to applications
4. **Data isolation** is maintained per-origin

```
┌─────────────────────────────────────────────────────────────┐
│                     Host Application                        │
│                                                             │
│  ┌─────────────┐    postMessage    ┌─────────────────────┐  │
│  │ @federise/  │ ◄──────────────►  │  Federise Frame     │  │
│  │    sdk      │                   │  (invisible iframe) │  │
│  └─────────────┘                   └─────────────────────┘  │
│                                              │              │
└──────────────────────────────────────────────│──────────────┘
                                               │ HTTP
                                               ▼
                                    ┌──────────────────┐
                                    │  Gateway API     │
                                    │  (Cloudflare     │
                                    │   Workers)       │
                                    └────────┬─────────┘
                                             │
                           ┌─────────────────┼─────────────────┐
                           │                 │                 │
                           ▼                 ▼                 ▼
                    ┌──────────┐      ┌──────────┐      ┌──────────┐
                    │   KV     │      │    R2    │      │  Future  │
                    │ Storage  │      │          │      │          │
                    └──────────┘      └──────────┘      └──────────┘
```

---

## Monorepo Structure

```
federise-monorepo/
├── apps/
│   ├── org/                  # Main web application (Astro + Svelte)
│   │   ├── src/
│   │   │   ├── pages/        # Astro routes
│   │   │   ├── components/   # Svelte/Astro components
│   │   │   ├── lib/          # Business logic
│   │   │   ├── api/          # API client
│   │   │   └── utils/        # Utilities
│   │   ├── service-worker/   # Workbox-based SW
│   │   └── tests/            # Frame test harness
│   ├── gateway/              # API backend (git submodule)
│   └── demo/                 # Demo application (placeholder)
├── packages/
│   └── sdk/                  # Browser SDK for host apps
├── docs/                     # Documentation
├── pnpm-workspace.yaml       # Workspace configuration
└── package.json              # Root package with scripts
```

---

## Apps

### Org App

**Location:** `apps/org/`
**Tech Stack:** Astro 5.x, Svelte 5.x, Cloudflare Workers

The org app is the main Federise web application providing:

#### Key Pages

| Route | Purpose |
|-------|---------|
| `/` | Landing page |
| `/frame` | Invisible iframe endpoint for SDK communication |
| `/authorize` | Permission authorization flow |
| `/start` | Getting started guide |
| `/offline` | Offline fallback page |
| `/manage/*` | Management dashboard |

#### Core Components

**FrameEnforcer** (`src/components/FrameEnforcer.svelte`)
- Core component that handles all postMessage communication
- Validates requests against permission store
- Manages KV operations via localStorage
- Broadcasts permission updates via BroadcastChannel

**AuthorizeFlow** (`src/components/AuthorizeFlow.svelte`)
- Handles the user authorization popup flow
- Displays requested permissions
- Allows users to grant/deny capabilities

**Management Components** (`src/components/manage/`)
- DataBrowser: Browse and manage KV data
- IdentitiesManager: Manage identities
- Permissions: View and revoke permissions
- Settings: Application settings
- Recovery: Account recovery options

#### Permission System (`src/lib/permissions.ts`)

```typescript
interface OriginPermissions {
  origin: string;
  capabilities: Capability[];
  grantedAt: number;
  expiresAt?: number;
}
```

Permissions are:
- Stored in localStorage (primary)
- Optionally synced to gateway KV
- Updated across tabs via BroadcastChannel
- Scoped per-origin

#### Service Worker (`service-worker/`)

Workbox-based caching strategy:
- **Pages:** Network-first (always fresh)
- **Static assets:** Cache-first (content-hashed)
- **Images:** Cache-first with 60-day expiration
- **Fonts:** Cache-first with 1-year expiration
- **API calls:** Network-only (never cached)
- **Offline:** Falls back to `/offline` page

#### Configuration

- `astro.config.mjs` - Astro with Cloudflare adapter
- `wrangler.jsonc` - Cloudflare Workers deployment
- `tsconfig.json` - Extends astro/strict

---

### Gateway

**Location:** `apps/gateway/` (git submodule)
**Repository:** `git@github.com:Federise/deploy.git`
**Tech Stack:** Hono, Chanfana (OpenAPI), Zod, Cloudflare Workers

The gateway provides the RESTful API backend.

#### API Endpoints

**Health:**
- `GET /ping` - Health check

**Identities (API Keys):**
- `POST /identity/list` - List all identities
- `POST /identity/create` - Create new identity
- `POST /identity/delete` - Delete identity

**Key-Value Storage:**
- `POST /kv/get` - Get value by key
- `POST /kv/set` - Set key-value pair
- `POST /kv/bulk/get` - Bulk get multiple keys
- `POST /kv/bulk/set` - Bulk set multiple pairs
- `POST /kv/keys` - List keys with optional prefix
- `POST /kv/namespaces` - List available namespaces
- `POST /kv/dump` - Dump entire namespace

**Blob Storage (R2):**
- `POST /blob/upload` - Upload file
- `POST /blob/get` - Get file
- `POST /blob/list` - List files
- `POST /blob/delete` - Delete file

#### Authentication

API Key-based authentication via `Authorization: ApiKey <key>` header.

```
┌─────────────┐     Authorization: ApiKey xxx     ┌─────────────┐
│   Client    │ ──────────────────────────────►  │   Gateway   │
└─────────────┘                                   └──────┬──────┘
                                                         │
                                                         ▼
                                                  ┌──────────────┐
                                                  │ Hash ApiKey  │
                                                  │ Check KV for │
                                                  │   identity   │
                                                  └──────────────┘
```

#### Infrastructure

- **Cloudflare KV:** Primary key-value storage
- **R2 Buckets:** Binary blob storage (public + private)
- **Observability:** Enabled via Cloudflare

#### Submodule Management

```bash
# Update gateway
cd apps/gateway && git pull origin main && cd ../..
git add apps/gateway
git commit -m "chore: update gateway submodule"
```

---

## Packages

### SDK

**Location:** `packages/sdk/`
**Package:** `@federise/sdk`
**Tech Stack:** TypeScript 5.9.3

The SDK provides a browser-based client for host applications.

#### Installation

```bash
npm install @federise/sdk
# or
pnpm add @federise/sdk
```

#### Usage

```typescript
import { FederiseClient } from '@federise/sdk';

const client = new FederiseClient();

// Connect to Federise
await client.connect();

// Request capabilities
const result = await client.requestCapabilities(['kv:read', 'kv:write']);

// Use KV storage
await client.kv.set('key', 'value');
const value = await client.kv.get('key');
const keys = await client.kv.keys('prefix:');
await client.kv.delete('key');

// Disconnect when done
client.disconnect();
```

#### Capabilities

| Capability | Description |
|------------|-------------|
| `kv:read` | Read from key-value storage |
| `kv:write` | Write to key-value storage |
| `kv:delete` | Delete from key-value storage |
| `blob:read` | Read binary blobs |
| `blob:write` | Write binary blobs |
| `notifications` | Send notifications |

#### Error Handling

```typescript
import {
  FederiseError,
  PermissionDeniedError,
  TimeoutError,
  ConnectionError
} from '@federise/sdk';

try {
  await client.kv.get('key');
} catch (error) {
  if (error instanceof PermissionDeniedError) {
    console.log('Missing capability:', error.capability);
  } else if (error instanceof TimeoutError) {
    console.log('Request timed out');
  } else if (error instanceof ConnectionError) {
    console.log('Connection issue:', error.message);
  }
}
```

#### Configuration Options

```typescript
const client = new FederiseClient({
  frameUrl: 'https://federise.org/frame',  // Default
  timeout: 30000,                           // 30 seconds default
});
```

---

## Data Flow

### 1. Connection Establishment

```
Host App                    SDK                      Frame
    │                        │                         │
    │  new FederiseClient()  │                         │
    │───────────────────────►│                         │
    │                        │  create iframe          │
    │                        │────────────────────────►│
    │                        │                         │
    │                        │  __FRAME_READY__        │
    │                        │◄────────────────────────│
    │                        │                         │
    │                        │  SYN (version)          │
    │                        │────────────────────────►│
    │                        │                         │
    │                        │  ACK (capabilities)     │
    │                        │◄────────────────────────│
    │   connected            │                         │
    │◄───────────────────────│                         │
```

### 2. Capability Request Flow

```
Host App                    SDK                      Frame              Popup
    │                        │                         │                  │
    │  requestCapabilities() │                         │                  │
    │───────────────────────►│                         │                  │
    │                        │  REQUEST_CAPABILITIES   │                  │
    │                        │────────────────────────►│                  │
    │                        │                         │                  │
    │                        │  AUTH_REQUIRED (url)    │                  │
    │                        │◄────────────────────────│                  │
    │                        │                         │                  │
    │                        │  window.open(url)       │                  │
    │                        │─────────────────────────│─────────────────►│
    │                        │                         │                  │
    │                        │                         │  user grants     │
    │                        │                         │◄─────────────────│
    │                        │                         │                  │
    │                        │  CAPABILITIES_GRANTED   │                  │
    │                        │◄────────────────────────│ (BroadcastChannel)
    │   granted              │                         │
    │◄───────────────────────│                         │
```

### 3. KV Operation Flow

```
Host App                    SDK                      Frame              Storage
    │                        │                         │                  │
    │  client.kv.set(k, v)   │                         │                  │
    │───────────────────────►│                         │                  │
    │                        │  KV_SET (key, value)    │                  │
    │                        │────────────────────────►│                  │
    │                        │                         │  check caps      │
    │                        │                         │─────────────────►│
    │                        │                         │                  │
    │                        │                         │  localStorage    │
    │                        │                         │◄─────────────────│
    │                        │  KV_OK                  │                  │
    │                        │◄────────────────────────│                  │
    │   success              │                         │
    │◄───────────────────────│                         │
```

---

## Communication Protocol

### Protocol Version

Current: `1.0.0`

### Message Format

**Request Messages** (SDK → Frame):
```typescript
{
  id: string;           // Unique request ID
  type: 'SYN' | 'REQUEST_CAPABILITIES' | 'KV_GET' | 'KV_SET' | ...;
  // ...payload fields
}
```

**Response Messages** (Frame → SDK):
```typescript
{
  id: string;           // Matching request ID
  type: 'ACK' | 'CAPABILITIES_GRANTED' | 'KV_RESULT' | 'ERROR' | ...;
  // ...response fields
}
```

### Message Types

| Request Type | Response Type | Description |
|--------------|---------------|-------------|
| `SYN` | `ACK` | Connection handshake |
| `REQUEST_CAPABILITIES` | `CAPABILITIES_GRANTED` / `AUTH_REQUIRED` | Request permissions |
| `KV_GET` | `KV_RESULT` | Retrieve value |
| `KV_SET` | `KV_OK` | Store value |
| `KV_DELETE` | `KV_OK` | Delete key |
| `KV_KEYS` | `KV_KEYS_RESULT` | List keys |

### Error Responses

```typescript
{
  type: 'ERROR';
  id: string;
  code: string;        // e.g., 'PERMISSION_DENIED', 'TIMEOUT'
  message: string;
}
```

---

## Security Model

### Isolation Layers

1. **Origin Isolation:** Each origin has isolated permissions and data
2. **Iframe Sandbox:** Frame uses `allow-scripts allow-same-origin`
3. **postMessage Validation:** All messages verified against source window
4. **Capability-Based Access:** Operations require explicit grants

### Permission Lifecycle

```
┌──────────────┐    request    ┌──────────────┐
│   No Access  │──────────────►│   Pending    │
└──────────────┘               └──────┬───────┘
       ▲                              │
       │ revoke                       │ user grants
       │                              ▼
┌──────┴───────┐               ┌──────────────┐
│   Expired    │◄──────────────│   Granted    │
└──────────────┘    timeout    └──────────────┘
```

### Best Practices

1. **Request minimal capabilities** - Only ask for what you need
2. **Handle revocation** - Permissions can be revoked at any time
3. **Graceful degradation** - Handle denied permissions gracefully
4. **Never cache capabilities** - Always check current grants

---

## Storage Architecture

### Local Storage (Client-Side)

Used for:
- Permission storage (`federise:permissions:<origin>`)
- KV data (when offline or for client-side operations)
- Service worker cache manifests

### Cloudflare KV (Server-Side)

Used for:
- Identity (API key) storage
- User data synchronization
- Application configuration

### Cloudflare R2 (Binary Storage)

Two buckets:
- **Public:** Publicly accessible files
- **Private:** Access-controlled files

---

## Testing

### Frame Test Harness

**Location:** `apps/org/tests/`
**Port:** 5174

Browser-based tests for frame communication:

```bash
# Terminal 1: Start org app
pnpm dev

# Terminal 2: Start test harness
pnpm test:frame
```

**Test Categories:**
- Handshake (SYN/ACK)
- Capability requests
- KV operations (CRUD)
- Permission enforcement
- Error handling
- Message correlation

### Gateway Tests

**Location:** `apps/gateway/test/`
**Framework:** Vitest with Cloudflare Workers pool

```bash
cd apps/gateway && pnpm test
```

### Type Checking

```bash
# All checks
pnpm check

# Astro files
pnpm check:astro

# Svelte components
pnpm check:svelte
```

---

## Build & Deployment

### Development

```bash
# Install dependencies
pnpm install
cd apps/gateway && pnpm install && cd ../..

# Start all apps
pnpm dev

# Start individual apps
cd apps/org && pnpm dev
cd apps/gateway && pnpm dev
```

### Build

```bash
# Build all
pnpm build

# Build org app (includes service worker)
cd apps/org && pnpm build
```

**Org app build process:**
1. Build service worker (Rollup)
2. Build Astro site
3. Generate full service worker with manifest
4. Copy service worker files to dist

### API Type Generation

After gateway API changes:

```bash
pnpm -w generate:api
```

This:
1. Generates `openapi.json` from gateway source
2. Generates TypeScript types for org app

### Deployment

```bash
# Deploy org app
cd apps/org && pnpm deploy

# Deploy gateway
cd apps/gateway && pnpm deploy
```

Both deploy to Cloudflare Workers.

---

## Configuration Reference

### Root `package.json` Scripts

| Script | Description |
|--------|-------------|
| `dev` | Run all apps in parallel |
| `build` | Build all workspaces |
| `test` | Run all tests |
| `clean` | Clean node_modules and builds |
| `generate:api` | Regenerate API types |

### Environment Variables

Set in Cloudflare Workers dashboard or `wrangler.jsonc`:

**Gateway:**
- `BOOTSTRAP_API_KEY` - Initial admin API key

**Org:**
- `GATEWAY_URL` - Gateway API URL

### TypeScript Configurations

- **Root:** Extends from individual app configs
- **Org:** `astro/strict` base
- **Gateway:** Strict mode, ES2024 lib
- **SDK:** ES2020 target, strict mode

/**
 * @federise/proxy - Reusable message routing and backend abstraction.
 *
 * This package extracts the core functionality from the iframe frame
 * into reusable components that can be deployed in different contexts:
 * - iframe (org app)
 * - Browser extension
 * - Local-only apps
 */

// Core classes
export { MessageRouter } from './router';
export type { MessageRouterOptions } from './router';

// Backends
export { RemoteBackend } from './backends/remote';
export type { RemoteBackendOptions } from './backends/remote';

// Capability stores
export { CookieCapabilityStore } from './capabilities/cookie-store';
export type { CookieCapabilityStoreOptions } from './capabilities/cookie-store';

// Transports
export { PostMessageTransport } from './transports/postmessage';
export type { PostMessageTransportOptions } from './transports/postmessage';

// Utilities
export { buildNamespace } from './namespace';

// Types
export type {
  ProxyBackend,
  CapabilityStore,
  PermissionRecord,
  BlobUploadOptions,
  PresignUploadResult,
  ChannelCreateResult,
  TokenCreateOptions,
  TokenResult,
  ProxyError,
} from './types';

// Re-export SDK types for convenience
export type {
  Capability,
  BlobVisibility,
  BlobMetadata,
  ChannelMeta,
  ChannelEvent,
  ChannelReadResult,
  ChannelPermissionInput,
  RequestMessage,
  ResponseMessage,
} from './types';

// Re-export SDK utilities
export { PROTOCOL_VERSION, isValidRequest } from '@federise/sdk';

// Vault (multi-identity credential storage)
export {
  createVaultStorage,
  createVaultQueries,
  migrateToVault,
  needsMigration,
  updateMigratedIdentity,
  cleanupLegacyKeys,
  VAULT_VERSION,
  VAULT_STORAGE_KEY,
  LEGACY_API_KEY,
  LEGACY_GATEWAY_URL,
} from './vault';
export type {
  VaultStorage,
} from './vault/storage';
export type {
  VaultQueries,
  CapabilityQueryOptions,
  VaultSummary,
} from './vault/queries';
export type {
  Vault,
  VaultEntry,
  VaultCapability,
  IdentityInfo,
  IdentityType,
  IdentitySource,
  AddVaultEntryOptions,
  VaultQueryOptions,
} from './vault/types';

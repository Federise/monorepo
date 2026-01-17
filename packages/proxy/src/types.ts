/**
 * Core types for the Federise proxy package.
 *
 * These interfaces define the contracts between transports, routers, and backends,
 * enabling reuse across different deployment contexts (iframe, extension, etc.)
 */

import type {
  Capability,
  BlobVisibility,
  BlobMetadata,
  ChannelMeta,
  ChannelEvent,
  ChannelReadResult,
  ChannelPermissionInput,
  RequestMessage,
  ResponseMessage,
} from '@federise/sdk';

// Re-export SDK types for consumers
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
};

/**
 * Options for blob upload operations.
 */
export interface BlobUploadOptions {
  visibility?: BlobVisibility;
  /** @deprecated Use `visibility` instead */
  isPublic?: boolean;
}

/**
 * Result of a presigned upload URL request.
 */
export interface PresignUploadResult {
  uploadUrl: string;
  metadata: BlobMetadata;
  expiresAt: string;
}

/**
 * Result of channel creation.
 */
export interface ChannelCreateResult {
  metadata: ChannelMeta;
  secret: string;
}

/**
 * Options for channel token creation.
 */
export interface TokenCreateOptions {
  displayName?: string;
  expiresInSeconds?: number;
}

/**
 * Result of channel token creation.
 */
export interface TokenResult {
  token: string;
  expiresAt: string;
}

/**
 * Backend interface for storage operations.
 *
 * Implementations include:
 * - RemoteBackend: HTTP calls to gateway API
 * - LocalBackend: IndexedDB storage (future)
 * - HybridBackend: Combination with sync strategy (future)
 */
export interface ProxyBackend {
  // KV operations
  kvGet(namespace: string, key: string): Promise<string | null>;
  kvSet(namespace: string, key: string, value: string): Promise<void>;
  kvDelete(namespace: string, key: string): Promise<void>;
  kvKeys(namespace: string, prefix?: string): Promise<string[]>;

  // Blob operations
  blobUpload(
    namespace: string,
    key: string,
    contentType: string,
    data: ArrayBuffer,
    options: BlobUploadOptions
  ): Promise<BlobMetadata>;
  blobGet(namespace: string, key: string): Promise<{ url: string; metadata: BlobMetadata }>;
  blobDelete(namespace: string, key: string): Promise<void>;
  blobList(namespace: string): Promise<BlobMetadata[]>;
  blobPresignUpload(
    namespace: string,
    key: string,
    contentType: string,
    size: number,
    options: BlobUploadOptions
  ): Promise<PresignUploadResult | null>;
  blobSetVisibility(
    namespace: string,
    key: string,
    visibility: BlobVisibility
  ): Promise<BlobMetadata>;

  // Channel operations
  channelCreate(namespace: string, name: string): Promise<ChannelCreateResult>;
  channelList(namespace: string): Promise<ChannelMeta[]>;
  channelAppend(namespace: string, channelId: string, content: string, authorId?: string): Promise<ChannelEvent>;
  channelRead(
    namespace: string,
    channelId: string,
    afterSeq?: number,
    limit?: number
  ): Promise<ChannelReadResult>;
  channelDelete(namespace: string, channelId: string): Promise<void>;
  channelDeleteEvent(
    namespace: string,
    channelId: string,
    targetSeq: number,
    authorId?: string
  ): Promise<ChannelEvent>;
  channelCreateToken(
    namespace: string,
    channelId: string,
    permissions: ChannelPermissionInput[],
    options?: TokenCreateOptions
  ): Promise<TokenResult>;
}

/**
 * Permission record stored for an origin.
 */
export interface PermissionRecord {
  origin: string;
  capabilities: Capability[];
  grantedAt: string;
  expiresAt?: string;
}

/**
 * Capability store interface for permission management.
 *
 * Implementations include:
 * - CookieCapabilityStore: Uses gateway KV for storage (iframe context)
 * - ExtensionCapabilityStore: Uses chrome.storage.local (extension context)
 * - IndexedDBCapabilityStore: Uses IndexedDB (local-only context)
 */
export interface CapabilityStore {
  getCapabilities(origin: string): Promise<Capability[]>;
  hasCapability(origin: string, capability: Capability): Promise<boolean>;
  grantCapabilities(origin: string, capabilities: Capability[]): Promise<void>;
  revokeCapabilities(origin: string): Promise<void>;
}

/**
 * Options for MessageRouter construction.
 */
export interface MessageRouterOptions {
  backend: ProxyBackend;
  capabilities: CapabilityStore;
  /**
   * Called when capability approval is needed.
   * Should return the authorization URL to redirect to.
   */
  onAuthRequired?: (
    origin: string,
    requestedCapabilities: Capability[],
    alreadyGranted: Capability[]
  ) => Promise<string>;
  /**
   * Get the gateway URL for token creation responses.
   */
  getGatewayUrl?: () => string;
  /**
   * Enable test-only messages (TEST_GRANT_PERMISSIONS, TEST_CLEAR_PERMISSIONS).
   * Only enable in development mode.
   */
  enableTestMessages?: boolean;
  /**
   * Origins allowed to use test messages.
   */
  testMessageOrigins?: string[];
}

/**
 * Error thrown by proxy operations.
 */
export class ProxyError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'ProxyError';
  }
}

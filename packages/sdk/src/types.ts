// Capability types that can be requested/granted
export type Capability =
  | 'kv:read'
  | 'kv:write'
  | 'kv:delete'
  | 'blob:read'
  | 'blob:write'
  | 'channel:create'
  | 'channel:delete'
  | 'notifications';

// Blob visibility levels
export type BlobVisibility = 'public' | 'presigned' | 'private';

// Blob metadata returned from operations
export interface BlobMetadata {
  key: string;
  namespace: string;
  size: number;
  contentType: string;
  uploadedAt: string;
  visibility: BlobVisibility;
  // Legacy field (deprecated, kept for backward compatibility)
  isPublic?: boolean;
}

// Upload progress information
export interface UploadProgress {
  /** Current phase of upload */
  phase: 'reading' | 'uploading';
  /** Bytes processed in current phase */
  loaded: number;
  /** Total bytes to process in current phase */
  total: number;
  /** Percentage complete (0-100) for current phase */
  percentage: number;
}

// Upload options
export interface UploadOptions {
  /** Visibility level for the uploaded file */
  visibility?: BlobVisibility;
  /** @deprecated Use `visibility` instead. Maps to 'public' if true, 'private' otherwise */
  isPublic?: boolean;
  key?: string;
  onProgress?: (progress: UploadProgress) => void;
}

// Channel types
export interface ChannelMeta {
  channelId: string;
  name: string;
  ownerNamespace: string;
  createdAt: string;
}

// Channel permission types
export type ChannelPermission =
  | 'read'        // Read non-deleted events
  | 'append'      // Append new events (renamed from 'write')
  | 'read:deleted' // Read all events including soft-deleted
  | 'delete:own'  // Soft-delete events with matching authorId
  | 'delete:any'; // Soft-delete any event

// Legacy permission for backward compatibility
export type LegacyChannelPermission = 'read' | 'write';

// Combined permission type (accepts both new and legacy)
export type ChannelPermissionInput = ChannelPermission | LegacyChannelPermission;

// Event type discriminator
export type ChannelEventType = 'message' | 'deletion';

export interface ChannelEvent {
  id: string;
  seq: number;
  authorId: string;
  type?: ChannelEventType; // 'message' (default) or 'deletion'
  content?: string; // Optional for deletion events
  targetSeq?: number; // Only for deletion events - the seq being deleted
  deleted?: boolean; // Flag when returning soft-deleted events with read:deleted
  createdAt: string;
}

export interface ChannelCreateResult {
  metadata: ChannelMeta;
  secret: string;
}

export interface ChannelReadResult {
  events: ChannelEvent[];
  hasMore: boolean;
}

// Request payloads (without id, which is added by the client)
export type SynPayload = { type: 'SYN'; version: string };
export type RequestCapabilitiesPayload = { type: 'REQUEST_CAPABILITIES'; capabilities: Capability[] };
export type KVGetPayload = { type: 'KV_GET'; key: string };
export type KVSetPayload = { type: 'KV_SET'; key: string; value: string };
export type KVDeletePayload = { type: 'KV_DELETE'; key: string };
export type KVKeysPayload = { type: 'KV_KEYS'; prefix?: string };
export type BlobUploadPayload = { type: 'BLOB_UPLOAD'; key: string; contentType: string; data: ArrayBuffer; visibility?: BlobVisibility; isPublic?: boolean };
export type BlobGetPayload = { type: 'BLOB_GET'; key: string };
export type BlobDeletePayload = { type: 'BLOB_DELETE'; key: string };
export type BlobListPayload = { type: 'BLOB_LIST' };
export type BlobGetUploadUrlPayload = { type: 'BLOB_GET_UPLOAD_URL'; key: string; contentType: string; size: number; visibility?: BlobVisibility; isPublic?: boolean };
export type BlobSetVisibilityPayload = { type: 'BLOB_SET_VISIBILITY'; key: string; visibility: BlobVisibility };
export type ChannelCreatePayload = { type: 'CHANNEL_CREATE'; name: string };
export type ChannelListPayload = { type: 'CHANNEL_LIST' };
export type ChannelAppendPayload = { type: 'CHANNEL_APPEND'; channelId: string; content: string };
export type ChannelReadPayload = { type: 'CHANNEL_READ'; channelId: string; afterSeq?: number; limit?: number };
export type ChannelDeletePayload = { type: 'CHANNEL_DELETE'; channelId: string };
export type ChannelTokenCreatePayload = { type: 'CHANNEL_TOKEN_CREATE'; channelId: string; permissions: ChannelPermissionInput[]; displayName?: string; expiresInSeconds?: number };
export type ChannelInvitePayload = { type: 'CHANNEL_INVITE'; channelId: string; displayName: string; permissions: ChannelPermissionInput[]; expiresInSeconds?: number };
export type ChannelDeleteEventPayload = { type: 'CHANNEL_DELETE_EVENT'; channelId: string; targetSeq: number };
export type TestGrantPermissionsPayload = { type: 'TEST_GRANT_PERMISSIONS'; capabilities: Capability[] };
export type TestClearPermissionsPayload = { type: 'TEST_CLEAR_PERMISSIONS' };
export type HandleTokenPayload = { type: 'HANDLE_TOKEN'; token: string; gatewayUrl?: string };

// Identity-related payloads
export type GetVaultSummaryPayload = { type: 'GET_VAULT_SUMMARY' };
export type GetIdentitiesForCapabilityPayload = {
  type: 'GET_IDENTITIES_FOR_CAPABILITY';
  capability: string;
  resourceType?: string;
  resourceId?: string;
  gatewayUrl?: string;
};
export type SelectIdentityPayload = { type: 'SELECT_IDENTITY'; identityId: string };
export type GetActiveIdentityPayload = { type: 'GET_ACTIVE_IDENTITY' };

export type RequestPayload =
  | SynPayload
  | RequestCapabilitiesPayload
  | KVGetPayload
  | KVSetPayload
  | KVDeletePayload
  | KVKeysPayload
  | BlobUploadPayload
  | BlobGetPayload
  | BlobDeletePayload
  | BlobListPayload
  | BlobGetUploadUrlPayload
  | BlobSetVisibilityPayload
  | ChannelCreatePayload
  | ChannelListPayload
  | ChannelAppendPayload
  | ChannelReadPayload
  | ChannelDeletePayload
  | ChannelDeleteEventPayload
  | ChannelTokenCreatePayload
  | ChannelInvitePayload
  | TestGrantPermissionsPayload
  | TestClearPermissionsPayload
  | HandleTokenPayload
  | GetVaultSummaryPayload
  | GetIdentitiesForCapabilityPayload
  | SelectIdentityPayload
  | GetActiveIdentityPayload;

// Request messages from SDK to Frame (with id)
export type RequestMessage = RequestPayload & { id: string };

// Response messages from Frame to SDK
export type ResponseMessage =
  | { type: 'ACK'; id: string; version: string; capabilities?: Capability[] }
  | { type: 'AUTH_REQUIRED'; id: string; url: string; granted?: Capability[] }
  | { type: 'PERMISSION_DENIED'; id: string; capability: Capability }
  | { type: 'CAPABILITIES_GRANTED'; id: string; granted: Capability[] }
  | { type: 'KV_RESULT'; id: string; value: string | null }
  | { type: 'KV_KEYS_RESULT'; id: string; keys: string[] }
  | { type: 'KV_OK'; id: string }
  | { type: 'BLOB_UPLOADED'; id: string; metadata: BlobMetadata }
  | { type: 'BLOB_DOWNLOAD_URL'; id: string; url: string; metadata: BlobMetadata }
  | { type: 'BLOB_UPLOAD_URL'; id: string; uploadUrl: string; metadata: BlobMetadata }
  | { type: 'BLOB_LIST_RESULT'; id: string; blobs: BlobMetadata[] }
  | { type: 'BLOB_VISIBILITY_SET'; id: string; metadata: BlobMetadata }
  | { type: 'BLOB_OK'; id: string }
  | { type: 'CHANNEL_CREATED'; id: string; metadata: ChannelMeta; secret: string }
  | { type: 'CHANNEL_LIST_RESULT'; id: string; channels: ChannelMeta[] }
  | { type: 'CHANNEL_APPENDED'; id: string; event: ChannelEvent }
  | { type: 'CHANNEL_READ_RESULT'; id: string; events: ChannelEvent[]; hasMore: boolean }
  | { type: 'CHANNEL_DELETED'; id: string }
  | { type: 'CHANNEL_EVENT_DELETED'; id: string; event: ChannelEvent }
  | { type: 'CHANNEL_TOKEN_CREATED'; id: string; token: string; expiresAt: string; gatewayUrl: string }
  | { type: 'CHANNEL_INVITE_CREATED'; id: string; tokenId: string; identityId: string; expiresAt: string; gatewayUrl: string }
  | { type: 'ERROR'; id: string; code: string; message: string }
  | { type: 'TEST_PERMISSIONS_GRANTED'; id: string }
  | { type: 'TEST_PERMISSIONS_CLEARED'; id: string }
  | { type: 'TOKEN_ACTION_REQUIRED'; id: string; action: TokenActionType; actionUrl: string }
  | { type: 'TOKEN_INVALID'; id: string; reason: string }
  | { type: 'TOKEN_HANDLED'; id: string; result: TokenHandleResult }
  | { type: 'VAULT_SUMMARY'; id: string; summary: VaultSummary }
  | { type: 'IDENTITIES_FOR_CAPABILITY'; id: string; identities: IdentityInfo[] }
  | { type: 'IDENTITY_SELECTED'; id: string; identity: IdentityInfo }
  | { type: 'ACTIVE_IDENTITY'; id: string; identity: IdentityInfo | null };

// Token action types
export type TokenActionType = 'identity_setup' | 'blob_access' | 'channel_access';

// Identity types
export type IdentityType = 'user' | 'service' | 'agent' | 'app' | 'anonymous';
export type IdentitySource = 'owner' | 'granted';

// Safe identity info for apps (no secrets, no infrastructure details)
// Apps only need to know enough to display and select identities
export interface IdentityInfo {
  identityId: string;
  displayName: string;
  identityType: IdentityType;
  source: IdentitySource;
  isPrimary: boolean;
  // Note: gatewayUrl is intentionally NOT exposed to apps
  // Apps don't need to know which gateway the identity is connected to
}

// Vault summary - minimal info for apps
// Does NOT expose gateway URLs or detailed identity info
export interface VaultSummary {
  totalIdentities: number;
  hasOwnerIdentity: boolean;
  // Note: gateway counts and identity lists are intentionally NOT exposed
}

// Result of handling a token
export interface TokenHandleResult {
  action: TokenActionType | 'already_claimed' | 'direct_access';
  actionUrl?: string;
  data?: unknown;
}

// Client options
export interface FederiseClientOptions {
  frameUrl?: string;
  timeout?: number;
}

// Result of capability request
export interface GrantResult {
  granted: boolean;
  capabilities: Capability[];
  pending: Capability[];
}

// Error types
export class FederiseError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = 'FederiseError';
  }
}

export class PermissionDeniedError extends FederiseError {
  constructor(public capability: Capability) {
    super(`Permission denied: ${capability}`, 'PERMISSION_DENIED');
    this.name = 'PermissionDeniedError';
  }
}

export class TimeoutError extends FederiseError {
  constructor() {
    super('Request timed out', 'TIMEOUT');
    this.name = 'TimeoutError';
  }
}

export class ConnectionError extends FederiseError {
  constructor(message: string) {
    super(message, 'CONNECTION_ERROR');
    this.name = 'ConnectionError';
  }
}

// Protocol version
export const PROTOCOL_VERSION = '1.0.0';

// Type guard to check if a message is a valid request
export function isValidRequest(data: unknown): data is RequestMessage {
  if (typeof data !== 'object' || data === null) return false;
  const msg = data as Record<string, unknown>;
  if (typeof msg.type !== 'string' || typeof msg.id !== 'string') return false;

  switch (msg.type) {
    case 'SYN':
      return typeof msg.version === 'string';
    case 'REQUEST_CAPABILITIES':
    case 'TEST_GRANT_PERMISSIONS':
      return Array.isArray(msg.capabilities);
    case 'KV_GET':
    case 'KV_DELETE':
      return typeof msg.key === 'string';
    case 'KV_SET':
      return typeof msg.key === 'string' && typeof msg.value === 'string';
    case 'KV_KEYS':
      return msg.prefix === undefined || typeof msg.prefix === 'string';
    case 'BLOB_UPLOAD':
      return (
        typeof msg.key === 'string' &&
        typeof msg.contentType === 'string' &&
        msg.data instanceof ArrayBuffer &&
        (typeof msg.visibility === 'string' || typeof msg.isPublic === 'boolean')
      );
    case 'BLOB_GET':
    case 'BLOB_DELETE':
      return typeof msg.key === 'string';
    case 'BLOB_LIST':
      return true;
    case 'BLOB_GET_UPLOAD_URL':
      return (
        typeof msg.key === 'string' &&
        typeof msg.contentType === 'string' &&
        typeof msg.size === 'number' &&
        (typeof msg.visibility === 'string' || typeof msg.isPublic === 'boolean')
      );
    case 'BLOB_SET_VISIBILITY':
      return typeof msg.key === 'string' && typeof msg.visibility === 'string';
    case 'TEST_CLEAR_PERMISSIONS':
      return true;
    case 'CHANNEL_CREATE':
      return typeof msg.name === 'string';
    case 'CHANNEL_LIST':
      return true;
    case 'CHANNEL_APPEND':
      return typeof msg.channelId === 'string' && typeof msg.content === 'string';
    case 'CHANNEL_READ':
      return typeof msg.channelId === 'string';
    case 'CHANNEL_DELETE':
      return typeof msg.channelId === 'string';
    case 'CHANNEL_TOKEN_CREATE':
      return typeof msg.channelId === 'string' && Array.isArray(msg.permissions);
    case 'CHANNEL_INVITE':
      return typeof msg.channelId === 'string' && typeof msg.displayName === 'string' && Array.isArray(msg.permissions);
    case 'CHANNEL_DELETE_EVENT':
      return typeof msg.channelId === 'string' && typeof msg.targetSeq === 'number';
    case 'HANDLE_TOKEN':
      return typeof msg.token === 'string';
    case 'GET_VAULT_SUMMARY':
    case 'GET_ACTIVE_IDENTITY':
      return true;
    case 'GET_IDENTITIES_FOR_CAPABILITY':
      return typeof msg.capability === 'string';
    case 'SELECT_IDENTITY':
      return typeof msg.identityId === 'string';
    default:
      return false;
  }
}

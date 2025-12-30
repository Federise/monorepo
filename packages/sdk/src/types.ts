// Capability types that can be requested/granted
export type Capability =
  | 'kv:read'
  | 'kv:write'
  | 'kv:delete'
  | 'blob:read'
  | 'blob:write'
  | 'notifications';

// Blob metadata returned from operations
export interface BlobMetadata {
  key: string;
  namespace: string;
  size: number;
  contentType: string;
  uploadedAt: string;
  isPublic: boolean;
}

// Request payloads (without id, which is added by the client)
export type SynPayload = { type: 'SYN'; version: string };
export type RequestCapabilitiesPayload = { type: 'REQUEST_CAPABILITIES'; capabilities: Capability[] };
export type KVGetPayload = { type: 'KV_GET'; key: string };
export type KVSetPayload = { type: 'KV_SET'; key: string; value: string };
export type KVDeletePayload = { type: 'KV_DELETE'; key: string };
export type KVKeysPayload = { type: 'KV_KEYS'; prefix?: string };
export type BlobUploadPayload = { type: 'BLOB_UPLOAD'; key: string; contentType: string; data: ArrayBuffer; isPublic: boolean };
export type BlobGetPayload = { type: 'BLOB_GET'; key: string };
export type BlobDeletePayload = { type: 'BLOB_DELETE'; key: string };
export type BlobListPayload = { type: 'BLOB_LIST' };
export type TestGrantPermissionsPayload = { type: 'TEST_GRANT_PERMISSIONS'; capabilities: Capability[] };
export type TestClearPermissionsPayload = { type: 'TEST_CLEAR_PERMISSIONS' };

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
  | TestGrantPermissionsPayload
  | TestClearPermissionsPayload;

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
  | { type: 'BLOB_LIST_RESULT'; id: string; blobs: BlobMetadata[] }
  | { type: 'BLOB_OK'; id: string }
  | { type: 'ERROR'; id: string; code: string; message: string }
  | { type: 'TEST_PERMISSIONS_GRANTED'; id: string }
  | { type: 'TEST_PERMISSIONS_CLEARED'; id: string };

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

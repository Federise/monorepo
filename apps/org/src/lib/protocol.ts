// Re-export shared types from SDK (single source of truth)
export type {
  Capability,
  BlobVisibility,
  BlobMetadata,
  RequestMessage,
  ResponseMessage,
} from '@federise/sdk';
export { PROTOCOL_VERSION } from '@federise/sdk';

import type { Capability, RequestMessage } from '@federise/sdk';

// Frame status messages (no id, broadcast style)
export type FrameStatusMessage =
  | { type: '__FRAME_READY__' }
  | { type: '__STORAGE_ACCESS_REQUIRED__' }
  | { type: '__STORAGE_ACCESS_GRANTED__' };

// Permission record stored in KV
export interface PermissionRecord {
  origin: string;
  capabilities: Capability[];
  grantedAt: string;
  expiresAt?: string;
}

// Permission table mapping origins to records
export interface PermissionsTable {
  [origin: string]: PermissionRecord;
}

// Capability labels for display
export const CAPABILITY_LABELS: Record<Capability, string> = {
  'kv:read': 'Read your stored data',
  'kv:write': 'Write to your stored data',
  'kv:delete': 'Delete your stored data',
  'blob:read': 'Read your files',
  'blob:write': 'Upload files',
  'notifications': 'Send you notifications',
};

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
      return (
        typeof msg.key === 'string' &&
        typeof msg.visibility === 'string'
      );
    case 'TEST_CLEAR_PERMISSIONS':
      return true;
    default:
      return false;
  }
}

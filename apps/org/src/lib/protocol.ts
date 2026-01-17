// Re-export shared types from SDK (single source of truth)
export type {
  Capability,
  BlobVisibility,
  BlobMetadata,
  RequestMessage,
  ResponseMessage,
} from '@federise/sdk';
export { PROTOCOL_VERSION, isValidRequest } from '@federise/sdk';

import type { Capability } from '@federise/sdk';

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
  'channel:create': 'Create and manage chat channels',
  'channel:delete': 'Delete chat channels',
  'notifications': 'Send you notifications',
};


// Capability types that can be requested/granted
export type Capability =
  | 'kv:read'
  | 'kv:write'
  | 'kv:delete'
  | 'blob:read'
  | 'blob:write'
  | 'notifications';

// Request messages from SDK to Frame
export type RequestMessage =
  | { type: 'SYN'; id: string; version: string }
  | { type: 'REQUEST_CAPABILITIES'; id: string; capabilities: Capability[] }
  | { type: 'KV_GET'; id: string; key: string }
  | { type: 'KV_SET'; id: string; key: string; value: string }
  | { type: 'KV_DELETE'; id: string; key: string }
  | { type: 'KV_KEYS'; id: string; prefix?: string }
  | { type: 'TEST_GRANT_PERMISSIONS'; id: string; capabilities: Capability[] }
  | { type: 'TEST_CLEAR_PERMISSIONS'; id: string };

// Response messages from Frame to SDK
export type ResponseMessage =
  | { type: 'ACK'; id: string; version: string; capabilities?: Capability[] }
  | { type: 'AUTH_REQUIRED'; id: string; url: string; granted?: Capability[] }
  | { type: 'PERMISSION_DENIED'; id: string; capability: Capability }
  | { type: 'CAPABILITIES_GRANTED'; id: string; granted: Capability[] }
  | { type: 'KV_RESULT'; id: string; value: string | null }
  | { type: 'KV_KEYS_RESULT'; id: string; keys: string[] }
  | { type: 'KV_OK'; id: string }
  | { type: 'ERROR'; id: string; code: string; message: string }
  | { type: 'TEST_PERMISSIONS_GRANTED'; id: string }
  | { type: 'TEST_PERMISSIONS_CLEARED'; id: string };

// Permission record stored in localStorage
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

// BroadcastChannel message for permission updates
export interface PermissionUpdateMessage {
  type: 'PERMISSIONS_UPDATED';
  origin: string;
}

// Protocol version
export const PROTOCOL_VERSION = '1.0.0';

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
    case 'TEST_CLEAR_PERMISSIONS':
      return true;
    default:
      return false;
  }
}

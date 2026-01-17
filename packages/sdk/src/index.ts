// Main client
export { FederiseClient } from './client';

// Channel client for direct gateway access (recipients)
export { ChannelClient, type ChannelClientOptions } from './channel-client';

// Types
export type {
  BlobMetadata,
  BlobVisibility,
  Capability,
  FederiseClientOptions,
  GrantResult,
  ChannelEvent,
  ChannelMeta,
  ChannelCreateResult,
  ChannelReadResult,
  RequestMessage,
  RequestPayload,
  ResponseMessage,
  UploadOptions,
  UploadProgress,
} from './types';

// Errors
export {
  FederiseError,
  PermissionDeniedError,
  TimeoutError,
  ConnectionError,
  PROTOCOL_VERSION,
} from './types';

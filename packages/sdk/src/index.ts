// Main client
export { FederiseClient } from './client';

// Log client for direct gateway access (recipients)
export { LogClient, type LogClientOptions } from './log-client';

// Types
export type {
  BlobMetadata,
  BlobVisibility,
  Capability,
  FederiseClientOptions,
  GrantResult,
  LogEvent,
  LogMeta,
  LogCreateResult,
  LogReadResult,
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

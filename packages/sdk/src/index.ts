// Main client
export { FederiseClient } from './client';

// Types
export type {
  BlobMetadata,
  BlobVisibility,
  Capability,
  FederiseClientOptions,
  GrantResult,
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

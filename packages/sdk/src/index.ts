// Main client
export { FederiseClient } from './client';

// Types
export type {
  BlobMetadata,
  Capability,
  FederiseClientOptions,
  GrantResult,
  RequestMessage,
  RequestPayload,
  ResponseMessage,
} from './types';

// Errors
export {
  FederiseError,
  PermissionDeniedError,
  TimeoutError,
  ConnectionError,
  PROTOCOL_VERSION,
} from './types';

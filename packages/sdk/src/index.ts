// Main client
export { FederiseClient } from './client';

// Types
export type {
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

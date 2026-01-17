/**
 * Backend implementations for the proxy package.
 */

export { RemoteBackend } from './remote';
export type { RemoteBackendOptions } from './remote';

// Re-export types for convenience
export type { ProxyBackend, BlobUploadOptions, PresignUploadResult } from '../types';

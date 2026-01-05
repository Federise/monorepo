// Adapter interfaces
export * from "./adapters/index.js";

// Shared types and schemas
export * from "./types.js";

// Context types and helpers
export * from "./context.js";

// Crypto utilities
export { generateApiKey, hashApiKey } from "./lib/crypto.js";

// Auth middleware
export { createAuthMiddleware, type AuthMiddlewareOptions } from "./middleware/auth.js";

// Routes
export { registerGatewayRoutes, registerBlobDownloadRoute } from "./routes.js";

// Individual endpoints (for apps that need direct access)
export { PingEndpoint } from "./endpoints/ping.js";
export { PrincipalListEndpoint } from "./endpoints/principal/list.js";
export { PrincipalCreateEndpoint } from "./endpoints/principal/create.js";
export { PrincipalDeleteEndpoint } from "./endpoints/principal/delete.js";
export { KVListNamespacesEndpoint } from "./endpoints/kv/list-namespaces.js";
export { KVListKeysEndpoint } from "./endpoints/kv/list-keys.js";
export { KVGetEndpoint } from "./endpoints/kv/get.js";
export { KVSetEndpoint } from "./endpoints/kv/set.js";
export { KVBulkGetEndpoint } from "./endpoints/kv/bulk-get.js";
export { KVBulkSetEndpoint } from "./endpoints/kv/bulk-set.js";
export { KVDumpEndpoint } from "./endpoints/kv/dump.js";
export { BlobUploadEndpoint } from "./endpoints/blob/upload.js";
export { BlobPresignUploadEndpoint } from "./endpoints/blob/presign-upload.js";
export { BlobGetEndpoint } from "./endpoints/blob/get.js";
export { BlobDeleteEndpoint } from "./endpoints/blob/delete.js";
export { BlobListEndpoint } from "./endpoints/blob/list.js";

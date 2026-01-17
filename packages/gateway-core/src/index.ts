// Adapter interfaces
export * from "./adapters/index.js";

// Shared types and schemas
export * from "./types.js";

// Context types and helpers
export * from "./context.js";

// Crypto utilities
export { generateApiKey, hashApiKey } from "./lib/crypto.js";

// HMAC signing utilities for presigned URLs
export {
  signDownloadUrl,
  verifyDownloadUrl,
  generateSignedDownloadUrl,
  type SignedUrlParams,
} from "./lib/hmac.js";

// Namespace aliasing utilities
export {
  generateAlias,
  isFullNamespace,
  resolveNamespace,
  getAlias,
  getOrCreateAlias,
} from "./lib/namespace-alias.js";

// Observability utilities
export {
  generateRequestId,
  addObservabilityHeaders,
  type RequestAction,
  type RequestMetrics,
} from "./lib/observability.js";

// Auth middleware
export { createAuthMiddleware, type AuthMiddlewareOptions } from "./middleware/auth.js";

// Channel token utilities
export {
  createChannelToken,
  verifyChannelToken,
  parseChannelToken,
  type CreateTokenParams,
  type VerifiedToken,
} from "./lib/channel-token.js";

// Base62 encoding utilities
export { base62Encode, base62Decode, generateShortId } from "./lib/base62.js";

// Routes
export {
  registerGatewayRoutes,
  registerBlobDownloadRoute,
  registerPublicBlobRoute,
  registerTokenChannelRoutes,
  registerChannelSubscribeRoute,
  registerShortLinkResolveRoute,
} from "./routes.js";

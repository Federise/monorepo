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
export { createAuthMiddleware, type AuthMiddlewareOptions, type AuthContext } from "./middleware/auth.js";

// Identity system
export {
  createIdentity,
  createClaimableIdentity,
  activateIdentity,
  updateIdentity,
  deleteIdentity,
  IdentityType,
  IdentityStatus,
  type Identity,
  type CreateIdentityParams,
  type CreateClaimableIdentityParams,
  type UpdateIdentityParams,
  type AppConfig,
} from "./lib/identity.js";

// Credential system
export {
  createCredential,
  verifyCredential,
  rotateCredential,
  revokeCredential,
  CredentialType,
  CredentialStatus,
  type Credential,
  type CreateCredentialParams,
  type VerifyCredentialResult,
  type RotateCredentialResult,
  type CredentialScope,
} from "./lib/credential.js";

// Grant system
export {
  createGrant,
  revokeGrant,
  resolveEffectivePermissions,
  GrantSource,
  type CapabilityGrant,
  type CreateGrantParams,
  type GrantScope,
  type EffectivePermissions,
} from "./lib/grants.js";

// Unified token system
export {
  createToken,
  verifyToken,
  parseToken,
  TokenType,
  Permission,
  type Token,
  type VerifiedToken as UnifiedVerifiedToken,
  type CreateTokenParams as UnifiedCreateTokenParams,
  type TokenConstraints,
  type PermissionBitmap,
} from "./lib/unified-token.js";

// Stateful token system
export {
  TokenAction,
  generateTokenId,
  getTokenKVKey,
  isValidTokenId,
  isTokenExpired,
  isTokenRevoked,
  isTokenUsed,
  isTokenValid,
  getTokenInvalidReason,
  createIdentityClaimToken,
  createBlobAccessToken,
  markTokenUsed,
  revokeToken,
  serializeToken,
  deserializeToken,
  buildTokenShareUrl,
  buildCompactTokenShareUrl,
  parseCompactTokenShareUrl,
  type StatefulToken,
  type StatefulTokenBase,
  type IdentityClaimToken,
  type BlobAccessToken,
  type ChannelAccessToken,
  type CreateIdentityClaimTokenParams,
  type CreateBlobAccessTokenParams,
  type TokenLookupResult,
} from "./lib/stateful-token.js";

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

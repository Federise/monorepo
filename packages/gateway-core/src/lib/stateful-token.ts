/**
 * Stateful Token System
 *
 * This module implements opaque, revocable tokens stored in KV.
 * These tokens are used for operations that need to be tracked or revoked,
 * such as identity claim invitations.
 *
 * Token format: tk_<32 hex chars>
 * KV key format: __TOKEN:{id}
 *
 * @module stateful-token
 */

// ============================================================================
// Types and Enums
// ============================================================================

/**
 * Token action types - what the token allows you to do.
 */
export enum TokenAction {
  IDENTITY_CLAIM = "identity:claim", // Set credentials for a PENDING_CLAIM identity
  BLOB_ACCESS = "blob:access", // Access a specific blob (future)
  CHANNEL_ACCESS = "channel:access", // Access a channel with specific permissions (future)
}

/**
 * Base token record stored in KV.
 */
export interface StatefulTokenBase {
  id: string;
  action: TokenAction;
  createdAt: string;
  expiresAt: string;
  createdBy: string;
  label?: string; // Human-readable label (e.g., "For Bob")
  usedAt?: string;
  usedBy?: string;
  revoked?: boolean;
  revokedAt?: string;
  revokedReason?: string;
}

/**
 * Identity claim token - allows setting credentials for a PENDING_CLAIM identity.
 */
export interface IdentityClaimToken extends StatefulTokenBase {
  action: TokenAction.IDENTITY_CLAIM;
  payload: {
    identityId: string;
  };
}

/**
 * Blob access token - allows access to a specific blob.
 */
export interface BlobAccessToken extends StatefulTokenBase {
  action: TokenAction.BLOB_ACCESS;
  payload: {
    namespace: string;
    blobKey: string;
    permissions: string[]; // e.g., ["read", "delete"]
  };
}

/**
 * Channel access token - allows access to a channel.
 */
export interface ChannelAccessToken extends StatefulTokenBase {
  action: TokenAction.CHANNEL_ACCESS;
  payload: {
    channelId: string;
    permissions: string[]; // e.g., ["read", "append"]
  };
}

/**
 * Discriminated union of all stateful token types.
 */
export type StatefulToken = IdentityClaimToken | BlobAccessToken | ChannelAccessToken;

/**
 * Parameters for creating an identity claim token.
 */
export interface CreateIdentityClaimTokenParams {
  identityId: string;
  createdBy: string;
  label?: string;
  expiresInSeconds?: number;
}

/**
 * Parameters for creating a blob access token.
 */
export interface CreateBlobAccessTokenParams {
  namespace: string;
  blobKey: string;
  permissions: string[];
  createdBy: string;
  label?: string;
  expiresInSeconds?: number;
}

/**
 * Result of looking up a token.
 */
export interface TokenLookupResult {
  valid: boolean;
  token?: StatefulToken;
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_EXPIRY_SECONDS = 7 * 24 * 3600; // 7 days
const TOKEN_PREFIX = "tk_";
const KV_PREFIX = "__TOKEN:";

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generate a unique token ID.
 * Format: tk_<32 hex chars>
 */
export function generateTokenId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${TOKEN_PREFIX}${hex}`;
}

/**
 * Get the KV key for a token ID.
 */
export function getTokenKVKey(tokenId: string): string {
  return `${KV_PREFIX}${tokenId}`;
}

/**
 * Check if a string is a valid token ID format.
 */
export function isValidTokenId(tokenId: string): boolean {
  return tokenId.startsWith(TOKEN_PREFIX) && tokenId.length === 35; // tk_ + 32 hex
}

// ============================================================================
// Token Validation
// ============================================================================

/**
 * Check if a token has expired.
 */
export function isTokenExpired(token: StatefulToken): boolean {
  return new Date(token.expiresAt) < new Date();
}

/**
 * Check if a token has been revoked.
 */
export function isTokenRevoked(token: StatefulToken): boolean {
  return token.revoked === true;
}

/**
 * Check if a token has been used.
 */
export function isTokenUsed(token: StatefulToken): boolean {
  return token.usedAt !== undefined;
}

/**
 * Check if a token is valid (not expired, not revoked, not used).
 */
export function isTokenValid(token: StatefulToken): boolean {
  return !isTokenExpired(token) && !isTokenRevoked(token) && !isTokenUsed(token);
}

/**
 * Get the reason a token is invalid, or null if valid.
 */
export function getTokenInvalidReason(token: StatefulToken): string | null {
  if (isTokenExpired(token)) {
    return "Token has expired";
  }
  if (isTokenRevoked(token)) {
    return token.revokedReason || "Token has been revoked";
  }
  if (isTokenUsed(token)) {
    return "Token has already been used";
  }
  return null;
}

// ============================================================================
// Token Creation
// ============================================================================

/**
 * Create an identity claim token.
 */
export function createIdentityClaimToken(
  params: CreateIdentityClaimTokenParams
): IdentityClaimToken {
  const now = new Date();
  const expiresInSeconds = params.expiresInSeconds ?? DEFAULT_EXPIRY_SECONDS;

  return {
    id: generateTokenId(),
    action: TokenAction.IDENTITY_CLAIM,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + expiresInSeconds * 1000).toISOString(),
    createdBy: params.createdBy,
    label: params.label,
    payload: {
      identityId: params.identityId,
    },
  };
}

/**
 * Create a blob access token.
 */
export function createBlobAccessToken(
  params: CreateBlobAccessTokenParams
): BlobAccessToken {
  const now = new Date();
  const expiresInSeconds = params.expiresInSeconds ?? DEFAULT_EXPIRY_SECONDS;

  return {
    id: generateTokenId(),
    action: TokenAction.BLOB_ACCESS,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + expiresInSeconds * 1000).toISOString(),
    createdBy: params.createdBy,
    label: params.label,
    payload: {
      namespace: params.namespace,
      blobKey: params.blobKey,
      permissions: params.permissions,
    },
  };
}

// ============================================================================
// Token Mutation
// ============================================================================

/**
 * Mark a token as used.
 */
export function markTokenUsed<T extends StatefulToken>(
  token: T,
  usedBy: string
): T {
  return {
    ...token,
    usedAt: new Date().toISOString(),
    usedBy,
  };
}

/**
 * Revoke a token.
 */
export function revokeToken<T extends StatefulToken>(
  token: T,
  reason?: string
): T {
  return {
    ...token,
    revoked: true,
    revokedAt: new Date().toISOString(),
    revokedReason: reason,
  };
}

// ============================================================================
// Serialization
// ============================================================================

/**
 * Serialize a token to JSON for KV storage.
 */
export function serializeToken(token: StatefulToken): string {
  return JSON.stringify(token);
}

/**
 * Deserialize a token from KV storage.
 */
export function deserializeToken(json: string): StatefulToken | null {
  try {
    const data = JSON.parse(json);
    // Validate required fields
    if (!data.id || !data.action || !data.createdAt || !data.expiresAt) {
      return null;
    }
    return data as StatefulToken;
  } catch {
    return null;
  }
}

// ============================================================================
// Share URL Utilities
// ============================================================================

/**
 * Build a share URL with token and gateway parameters.
 *
 * Format: {baseUrl}/claim?token={tokenId}&gateway={encodedGatewayUrl}
 */
export function buildTokenShareUrl(
  tokenId: string,
  gatewayUrl: string,
  baseUrl?: string
): string {
  const base = baseUrl || gatewayUrl;
  const encodedGateway = encodeURIComponent(gatewayUrl);
  return `${base}/claim?token=${tokenId}&gateway=${encodedGateway}`;
}

/**
 * Build a compact share URL using hash fragment.
 *
 * Format: {baseUrl}#tk_xxx@base64(gatewayUrl)
 * This format is more compact for sharing via QR codes or short links.
 */
export function buildCompactTokenShareUrl(
  tokenId: string,
  gatewayUrl: string,
  baseUrl: string
): string {
  // Base64 encode gateway URL for compactness
  const encodedGateway = btoa(gatewayUrl);
  return `${baseUrl}#${tokenId}@${encodedGateway}`;
}

/**
 * Parse a compact share URL.
 *
 * Returns { tokenId, gatewayUrl } or null if invalid.
 */
export function parseCompactTokenShareUrl(
  url: string
): { tokenId: string; gatewayUrl: string } | null {
  try {
    const urlObj = new URL(url);
    const hash = urlObj.hash.slice(1); // Remove #
    const [tokenId, encodedGateway] = hash.split("@");

    if (!tokenId || !encodedGateway) {
      return null;
    }

    if (!tokenId.startsWith("tk_")) {
      return null;
    }

    const gatewayUrl = atob(encodedGateway);
    return { tokenId, gatewayUrl };
  } catch {
    return null;
  }
}

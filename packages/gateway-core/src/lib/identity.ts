/**
 * Identity System
 *
 * This module implements the identity model as specified in docs/identity-auth-requirements.md
 *
 * @module identity
 */

import { hashApiKey } from "./crypto.js";

// ============================================================================
// Types and Enums
// ============================================================================

export enum IdentityType {
  USER = "user",
  SERVICE = "service",
  AGENT = "agent",
  APP = "app",
  ANONYMOUS = "anonymous",
}

export enum IdentityStatus {
  PENDING_CLAIM = "pending_claim", // Identity exists but no credentials yet (awaiting claim)
  ACTIVE = "active",
  SUSPENDED = "suspended",
  DELETED = "deleted",
}

export interface AppConfig {
  origin: string;
  namespace?: string;
  grantedCapabilities: string[];
  frameAccess: boolean;
}

export interface Identity {
  id: string;
  type: IdentityType;
  displayName: string;
  status: IdentityStatus;
  createdAt: string;
  createdBy?: string;
  metadata?: Record<string, unknown>;
  appConfig?: AppConfig;
}

export interface CreateIdentityParams {
  type: IdentityType;
  displayName: string;
  createdBy?: string;
  metadata?: Record<string, unknown>;
  appConfig?: AppConfig;
}

export interface CreateClaimableIdentityParams {
  type: IdentityType;
  displayName: string;
  createdBy: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateIdentityParams {
  displayName?: string;
  status?: IdentityStatus;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// ID Generation
// ============================================================================

function generateIdentityId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `ident_${hex}`;
}

// ============================================================================
// Origin to Namespace (for APP identities)
// ============================================================================

/**
 * Convert an origin URL to a human-readable, URL-safe namespace.
 * Example: https://www.example-app.com → www_example-app_com
 * Example: http://localhost:5174 → localhost_5174
 */
function originToNamespace(origin: string): string {
  let namespace = origin;

  // Remove protocol
  namespace = namespace.replace(/^https?:\/\//, "");

  // Remove trailing slash
  namespace = namespace.replace(/\/$/, "");

  // Replace dots and colons with underscores (keeps port as part of namespace)
  namespace = namespace.replace(/[.:]/g, "_");

  // Remove any characters that aren't alphanumeric, underscore, or hyphen
  namespace = namespace.replace(/[^a-zA-Z0-9_-]/g, "");

  return namespace;
}

// ============================================================================
// Identity Operations
// ============================================================================

/**
 * Create a new identity.
 */
export function createIdentity(params: CreateIdentityParams): Identity {
  // Validation
  if (!params.type) {
    throw new Error("type is required");
  }

  if (!params.displayName || params.displayName.trim() === "") {
    throw new Error("displayName is required");
  }

  if (params.type === IdentityType.APP && !params.appConfig?.origin) {
    throw new Error("origin is required for APP identity");
  }

  // Build identity
  const identity: Identity = {
    id: generateIdentityId(),
    type: params.type,
    displayName: params.displayName,
    status: IdentityStatus.ACTIVE,
    createdAt: new Date().toISOString(),
    createdBy: params.createdBy,
    metadata: params.metadata,
  };

  // Add app config with namespace derived from origin
  if (params.appConfig) {
    identity.appConfig = {
      ...params.appConfig,
      namespace: originToNamespace(params.appConfig.origin),
    };
  }

  return identity;
}

/**
 * Create a claimable identity (PENDING_CLAIM status).
 * The identity exists but has no credentials yet - it must be claimed via a token.
 */
export function createClaimableIdentity(params: CreateClaimableIdentityParams): Identity {
  if (!params.type) {
    throw new Error("type is required");
  }

  if (!params.displayName || params.displayName.trim() === "") {
    throw new Error("displayName is required");
  }

  if (!params.createdBy) {
    throw new Error("createdBy is required for claimable identities");
  }

  return {
    id: generateIdentityId(),
    type: params.type,
    displayName: params.displayName,
    status: IdentityStatus.PENDING_CLAIM,
    createdAt: new Date().toISOString(),
    createdBy: params.createdBy,
    metadata: params.metadata,
  };
}

/**
 * Activate a PENDING_CLAIM identity after it has been claimed.
 */
export function activateIdentity(identity: Identity): Identity {
  if (identity.status !== IdentityStatus.PENDING_CLAIM) {
    throw new Error("Only PENDING_CLAIM identities can be activated");
  }
  return updateIdentity(identity, { status: IdentityStatus.ACTIVE });
}

/**
 * Get an identity by ID.
 * Note: This is a placeholder - actual implementation will use KV store.
 */
export function getIdentity(id: string): Identity | null {
  throw new Error("Not implemented - requires KV store");
}

/**
 * Update an identity.
 */
export function updateIdentity(
  identity: Identity,
  updates: UpdateIdentityParams
): Identity {
  return {
    ...identity,
    ...(updates.displayName && { displayName: updates.displayName }),
    ...(updates.status && { status: updates.status }),
    ...(updates.metadata && { metadata: { ...identity.metadata, ...updates.metadata } }),
  };
}

/**
 * Delete (mark as deleted) an identity.
 */
export function deleteIdentity(identity: Identity): Identity {
  return updateIdentity(identity, { status: IdentityStatus.DELETED });
}

/**
 * Credential System
 *
 * This module implements the credential model as specified in docs/identity-auth-requirements.md
 *
 * @module credential
 */

import { generateApiKey, hashApiKey } from "./crypto.js";

// ============================================================================
// Types and Enums
// ============================================================================

export enum CredentialType {
  API_KEY = "api_key",
  BEARER_TOKEN = "bearer_token",
  REFRESH_TOKEN = "refresh_token",
  INVITATION = "invitation",
}

export enum CredentialStatus {
  ACTIVE = "active",
  ROTATING = "rotating",
  REVOKED = "revoked",
}

export interface ResourceScope {
  type: string;
  id: string;
  permissions: string[];
}

export interface CredentialScope {
  capabilities?: string[];
  namespaces?: string[];
  resources?: ResourceScope[];
  expiresAt?: string;
}

export interface Credential {
  id: string;
  identityId: string;
  type: CredentialType;
  secretHash: string;
  status: CredentialStatus;
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
  scope?: CredentialScope;
  revocationReason?: string;
  revokedAt?: string;
}

export interface CreateCredentialParams {
  identityId: string;
  type: CredentialType;
  expiresAt?: string;
  scope?: CredentialScope;
}

export interface VerifyCredentialResult {
  valid: boolean;
  identityId?: string;
  reason?: string;
}

export interface RotateCredentialResult {
  oldCredential: Credential;
  newCredential: Credential;
  newSecret: string;
}

// ============================================================================
// ID Generation
// ============================================================================

function generateCredentialId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `cred_${hex}`;
}

// ============================================================================
// Credential Operations
// ============================================================================

/**
 * Create a new credential for an identity.
 * Returns both the credential (for storage) and the secret (one-time display).
 */
export async function createCredential(
  params: CreateCredentialParams
): Promise<{ credential: Credential; secret: string }> {
  const secret = generateApiKey();
  const secretHash = await hashApiKey(secret);

  const credential: Credential = {
    id: generateCredentialId(),
    identityId: params.identityId,
    type: params.type,
    secretHash,
    status: CredentialStatus.ACTIVE,
    createdAt: new Date().toISOString(),
    expiresAt: params.expiresAt,
    scope: params.scope,
  };

  return { credential, secret };
}

/**
 * Verify a credential against a provided secret.
 */
export async function verifyCredential(
  credential: Credential,
  secret: string
): Promise<VerifyCredentialResult> {
  // Check status
  if (credential.status === CredentialStatus.REVOKED) {
    return { valid: false, reason: "revoked" };
  }

  // Check expiry
  if (credential.expiresAt) {
    const expiresAt = new Date(credential.expiresAt).getTime();
    if (Date.now() > expiresAt) {
      return { valid: false, reason: "expired" };
    }
  }

  // Check scope expiry
  if (credential.scope?.expiresAt) {
    const scopeExpires = new Date(credential.scope.expiresAt).getTime();
    if (Date.now() > scopeExpires) {
      return { valid: false, reason: "scope_expired" };
    }
  }

  // Verify secret (timing-safe)
  const providedHash = await hashApiKey(secret);
  const isValid = timingSafeEqual(credential.secretHash, providedHash);

  if (!isValid) {
    return { valid: false, reason: "invalid_secret" };
  }

  return {
    valid: true,
    identityId: credential.identityId,
  };
}

/**
 * Rotate a credential, creating a new one while keeping the old one valid
 * during a grace period.
 */
export async function rotateCredential(
  oldCredential: Credential
): Promise<RotateCredentialResult> {
  // Mark old credential as rotating
  const updatedOld: Credential = {
    ...oldCredential,
    status: CredentialStatus.ROTATING,
  };

  // Create new credential with same scope
  const { credential: newCredential, secret: newSecret } = await createCredential({
    identityId: oldCredential.identityId,
    type: oldCredential.type,
    expiresAt: oldCredential.expiresAt,
    scope: oldCredential.scope,
  });

  return {
    oldCredential: updatedOld,
    newCredential,
    newSecret,
  };
}

/**
 * Revoke a credential.
 */
export function revokeCredential(
  credential: Credential,
  reason: string
): Credential {
  return {
    ...credential,
    status: CredentialStatus.REVOKED,
    revocationReason: reason,
    revokedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Timing-safe string comparison.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

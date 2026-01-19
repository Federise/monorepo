/**
 * Vault Types - Multi-identity credential storage
 *
 * The vault stores credentials for multiple identities across multiple gateways.
 * Each entry ties together: identity, credential (API key), gateway, and capabilities.
 */

/**
 * Identity types that can be stored in the vault.
 */
export type IdentityType = 'user' | 'service' | 'agent' | 'app' | 'anonymous';

/**
 * Source of how the identity was obtained.
 */
export type IdentitySource = 'owner' | 'granted';

/**
 * A capability grant stored in the vault.
 */
export interface VaultCapability {
  /** The capability string, e.g., "channel:read", "kv:write" */
  capability: string;
  /** Resource type if scoped, e.g., "channel" */
  resourceType?: string;
  /** Resource ID if scoped, e.g., "ch_abc123" */
  resourceId?: string;
  /** When this capability was granted */
  grantedAt: string;
}

/**
 * A single vault entry representing one identity with its credential.
 */
export interface VaultEntry {
  /** Unique identity ID from the gateway (ident_xxx format) */
  identityId: string;

  /** Human-friendly display name */
  displayName: string;

  /** Type of identity */
  identityType: IdentityType;

  /** Gateway URL this identity is associated with */
  gatewayUrl: string;

  /** Optional friendly name for the gateway */
  gatewayDisplayName?: string;

  /** The API key credential (plaintext, for making requests) */
  apiKey: string;

  /** Capabilities this identity has */
  capabilities: VaultCapability[];

  /** How this identity was obtained */
  source: IdentitySource;

  /** Origin of app that granted this identity (for 'granted' source) */
  referrer?: string;

  /** When this identity was claimed (for 'granted' source) */
  claimedAt?: string;

  /** When this entry was added to the vault */
  createdAt: string;

  /** Whether this is the primary identity for this gateway */
  isPrimary: boolean;

  /** Last time this identity was used for an operation */
  lastUsedAt?: string;

  /** Optional expiration time for the credential */
  expiresAt?: string;
}

/**
 * The complete vault structure stored in localStorage.
 */
export interface Vault {
  /** Schema version for migrations */
  version: number;

  /** All vault entries */
  entries: VaultEntry[];
}

/**
 * Safe identity info exposed to apps (no secrets, no infrastructure details).
 * Apps only need enough info to display and select identities.
 * Gateway URLs and capabilities are NOT exposed.
 */
export interface IdentityInfo {
  /** Identity ID */
  identityId: string;

  /** Display name */
  displayName: string;

  /** Identity type */
  identityType: IdentityType;

  /** How obtained */
  source: IdentitySource;

  /** Whether primary for gateway */
  isPrimary: boolean;

  // Note: gatewayUrl is intentionally NOT exposed to apps
  // Note: capabilities are intentionally NOT exposed to apps
}

/**
 * Options for adding a new vault entry.
 */
export interface AddVaultEntryOptions {
  /** Identity ID from gateway */
  identityId: string;

  /** Display name */
  displayName: string;

  /** Identity type */
  identityType: IdentityType;

  /** Gateway URL */
  gatewayUrl: string;

  /** Gateway display name (optional) */
  gatewayDisplayName?: string;

  /** API key credential */
  apiKey: string;

  /** Initial capabilities */
  capabilities?: VaultCapability[];

  /** Source of identity */
  source: IdentitySource;

  /** Referrer origin (for granted identities) */
  referrer?: string;

  /** When claimed (for granted identities) */
  claimedAt?: string;

  /** Force as primary even if others exist */
  forcePrimary?: boolean;

  /** Credential expiration */
  expiresAt?: string;
}

/**
 * Query options for finding vault entries.
 */
export interface VaultQueryOptions {
  /** Filter by gateway URL */
  gatewayUrl?: string;

  /** Filter by capability */
  capability?: string;

  /** Filter by resource type */
  resourceType?: string;

  /** Filter by resource ID */
  resourceId?: string;

  /** Filter by source */
  source?: IdentitySource;

  /** Only return primary identities */
  primaryOnly?: boolean;

  /** Exclude expired entries */
  excludeExpired?: boolean;
}

/** Current vault schema version */
export const VAULT_VERSION = 1;

/** localStorage key for the vault */
export const VAULT_STORAGE_KEY = 'federise:vault';

/** Legacy localStorage keys (for migration) */
export const LEGACY_API_KEY = 'federise:gateway:apiKey';
export const LEGACY_GATEWAY_URL = 'federise:gateway:url';

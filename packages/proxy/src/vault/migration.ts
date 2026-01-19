/**
 * Vault Migration - Migrate from single-credential to vault format
 *
 * Handles migration of legacy localStorage keys to the new vault structure.
 */

import type { Vault, VaultEntry } from './types';
import {
  VAULT_STORAGE_KEY,
  VAULT_VERSION,
  LEGACY_API_KEY,
  LEGACY_GATEWAY_URL,
} from './types';

/**
 * Result of a migration attempt.
 */
export interface MigrationResult {
  /** Whether migration was successful */
  success: boolean;
  /** Number of entries created */
  entriesCreated?: number;
  /** Reason for failure if not successful */
  reason?: string;
}

/**
 * Check if migration from legacy format is needed.
 *
 * @param storage - Storage backend (defaults to localStorage)
 * @returns true if migration is needed
 */
export function needsMigration(storage?: Storage): boolean {
  const actualStorage = storage ?? (typeof window !== 'undefined' ? localStorage : null);
  if (!actualStorage) return false;
  // Check if vault already exists
  const vault = actualStorage.getItem(VAULT_STORAGE_KEY);
  if (vault) {
    return false;
  }

  // Check if both legacy keys exist
  const apiKey = actualStorage.getItem(LEGACY_API_KEY);
  const gatewayUrl = actualStorage.getItem(LEGACY_GATEWAY_URL);

  return Boolean(apiKey && gatewayUrl);
}

/**
 * Migrate legacy single-credential storage to vault format.
 *
 * This creates a vault with a single entry containing the legacy credentials.
 * Legacy keys are preserved for backward compatibility with older frame versions.
 *
 * @param storage - Storage backend (defaults to localStorage)
 * @returns Migration result
 */
export function migrateToVault(storage?: Storage): MigrationResult {
  const actualStorage = storage ?? (typeof window !== 'undefined' ? localStorage : null);
  if (!actualStorage) {
    return { success: false, reason: 'No storage available' };
  }

  // Check if vault already exists
  const existingVault = actualStorage.getItem(VAULT_STORAGE_KEY);
  if (existingVault) {
    return {
      success: false,
      reason: 'Vault already exists',
    };
  }

  // Get legacy credentials
  const apiKey = actualStorage.getItem(LEGACY_API_KEY);
  const gatewayUrl = actualStorage.getItem(LEGACY_GATEWAY_URL);

  if (!apiKey || !gatewayUrl) {
    return {
      success: false,
      reason: 'No legacy credentials to migrate',
    };
  }

  // Create vault entry from legacy credentials
  const entry: VaultEntry = {
    // Use placeholder ID until we can resolve from gateway
    identityId: 'migrated_identity',
    displayName: 'Primary Identity',
    identityType: 'user',
    gatewayUrl: gatewayUrl,
    apiKey: apiKey,
    capabilities: [],
    source: 'owner',
    createdAt: new Date().toISOString(),
    isPrimary: true,
  };

  // Create and save vault
  const vault: Vault = {
    version: VAULT_VERSION,
    entries: [entry],
  };

  actualStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(vault));

  // Note: We intentionally keep legacy keys for backward compatibility
  // They will be removed in a future version after sufficient migration period

  return {
    success: true,
    entriesCreated: 1,
  };
}

/**
 * Update a migrated entry with resolved identity information.
 *
 * After migration, the identityId is a placeholder. This function updates
 * it with the actual identity ID from the gateway's /identity/whoami endpoint.
 *
 * @param storage - Storage backend
 * @param resolvedIdentityId - The actual identity ID from gateway
 * @param displayName - Optional display name from gateway
 */
export function updateMigratedIdentity(
  storage: Storage,
  resolvedIdentityId: string,
  displayName?: string
): void {
  const raw = storage.getItem(VAULT_STORAGE_KEY);
  if (!raw) return;

  try {
    const vault: Vault = JSON.parse(raw);
    const migratedEntry = vault.entries.find(
      (e) => e.identityId === 'migrated_identity'
    );

    if (migratedEntry) {
      migratedEntry.identityId = resolvedIdentityId;
      if (displayName) {
        migratedEntry.displayName = displayName;
      }
      storage.setItem(VAULT_STORAGE_KEY, JSON.stringify(vault));
    }
  } catch {
    // Ignore errors
  }
}

/**
 * Remove legacy keys after successful migration verification.
 *
 * Only call this after confirming the vault is working correctly.
 *
 * @param storage - Storage backend
 */
export function cleanupLegacyKeys(storage?: Storage): void {
  const actualStorage = storage ?? (typeof window !== 'undefined' ? localStorage : null);
  if (!actualStorage) return;
  actualStorage.removeItem(LEGACY_API_KEY);
  actualStorage.removeItem(LEGACY_GATEWAY_URL);
}

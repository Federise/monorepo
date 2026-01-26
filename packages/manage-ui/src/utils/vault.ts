/**
 * Vault utilities for getting credentials from the vault.
 * Used by lib files that need direct API access.
 */

import { createVaultStorage } from '@federise/proxy';
import type { VaultEntry } from '@federise/proxy';

/**
 * Get the primary identity from the vault.
 * Returns the primary identity, or first owner, or first identity.
 */
export function getPrimaryIdentity(): VaultEntry | null {
  const vault = createVaultStorage(localStorage);
  const entries = vault.getAll();

  if (entries.length === 0) return null;

  // Find primary identity
  const primary = entries.find(e => e.isPrimary);
  if (primary) return primary;

  // Fall back to first owner identity
  const owner = entries.find(e => e.source === 'owner');
  if (owner) return owner;

  // Fall back to first identity
  return entries[0];
}

/**
 * Get credentials for API calls.
 * Throws if no identity is configured.
 */
export function getCredentials(): { apiKey: string; gatewayUrl: string } {
  const identity = getPrimaryIdentity();
  if (!identity) {
    throw new Error('No identity configured. Please set up your Federise account.');
  }
  return {
    apiKey: identity.apiKey,
    gatewayUrl: identity.gatewayUrl,
  };
}

/**
 * Check if an identity is configured.
 */
export function hasIdentity(): boolean {
  return getPrimaryIdentity() !== null;
}

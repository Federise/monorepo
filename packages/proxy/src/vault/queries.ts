/**
 * Vault Queries - Query helpers for finding identities by capability/resource
 *
 * Provides query methods for finding which identities have access to what.
 */

import type { VaultStorage } from './storage';
import type { VaultCapability, IdentityInfo, IdentitySource } from './types';

/**
 * Query options for capability lookups.
 */
export interface CapabilityQueryOptions {
  /** Filter by gateway URL */
  gatewayUrl?: string;
  /** Include expired identities (default: false) */
  includeExpired?: boolean;
}

/**
 * Query options for source lookups.
 */
export interface SourceQueryOptions {
  /** Filter by gateway URL */
  gatewayUrl?: string;
}

/**
 * Vault summary statistics exposed to apps.
 * Intentionally minimal - apps don't need detailed vault info.
 */
export interface VaultSummary {
  /** Total number of identities (apps need this to know if they should prompt setup) */
  totalIdentities: number;
  /** Whether the user has at least one owner identity */
  hasOwnerIdentity: boolean;
  // Note: Gateway counts and identity lists are NOT exposed to apps
}

/**
 * VaultQueries interface for querying vault entries.
 */
export interface VaultQueries {
  /**
   * Get all identities that have a specific capability.
   *
   * @param capability - The capability to search for (e.g., "channel:read")
   * @param resourceType - Optional resource type (e.g., "channel")
   * @param resourceId - Optional resource ID (e.g., "ch_123")
   * @param options - Query options
   */
  getIdentitiesForCapability(
    capability: string,
    resourceType?: string,
    resourceId?: string,
    options?: CapabilityQueryOptions
  ): IdentityInfo[];

  /**
   * Get all identities that have any capability for a resource.
   *
   * @param resourceType - Resource type (e.g., "channel")
   * @param resourceId - Resource ID (e.g., "ch_123")
   * @param options - Query options
   */
  getIdentitiesForResource(
    resourceType: string,
    resourceId: string,
    options?: CapabilityQueryOptions
  ): IdentityInfo[];

  /**
   * Get all capabilities for a specific identity.
   *
   * @param identityId - The identity ID
   * @param options - Filter options
   */
  getCapabilitiesForIdentity(
    identityId: string,
    options?: { resourceType?: string }
  ): VaultCapability[];

  /**
   * Check if an identity can access a resource with a specific capability.
   *
   * @param identityId - The identity ID
   * @param capability - The capability to check
   * @param resourceType - Resource type
   * @param resourceId - Resource ID
   */
  canAccessResource(
    identityId: string,
    capability: string,
    resourceType?: string,
    resourceId?: string
  ): boolean;

  /**
   * Get identities by source (owner or granted).
   *
   * @param source - The source type
   * @param options - Query options
   */
  getIdentitiesBySource(
    source: IdentitySource,
    options?: SourceQueryOptions
  ): IdentityInfo[];

  /**
   * Group all identities by gateway URL.
   */
  groupByGateway(): Record<string, IdentityInfo[]>;

  /**
   * Get vault summary statistics.
   */
  getSummary(): VaultSummary;
}

/**
 * Create vault query helpers.
 *
 * @param vault - The vault storage instance
 */
export function createVaultQueries(vault: VaultStorage): VaultQueries {
  return {
    getIdentitiesForCapability(
      capability: string,
      resourceType?: string,
      resourceId?: string,
      options?: CapabilityQueryOptions
    ): IdentityInfo[] {
      const entries = vault.getAll();
      const results: IdentityInfo[] = [];

      for (const entry of entries) {
        // Filter by gateway if specified
        if (options?.gatewayUrl && entry.gatewayUrl !== options.gatewayUrl) {
          continue;
        }

        // Filter out expired unless explicitly included
        if (!options?.includeExpired && vault.isExpired(entry)) {
          continue;
        }

        // Owner identities have full access to all resources on their gateway.
        // Include them for both general queries and resource-specific queries.
        if (entry.source === 'owner') {
          results.push(vault.toSafeInfo(entry));
          continue;
        }

        // For granted identities or resource-specific queries, check capabilities
        const hasCapability = entry.capabilities.some((c) => {
          if (c.capability !== capability) {
            return false;
          }
          // If resource is specified, must match
          if (resourceType !== undefined && c.resourceType !== resourceType) {
            return false;
          }
          if (resourceId !== undefined && c.resourceId !== resourceId) {
            return false;
          }
          return true;
        });

        if (hasCapability) {
          results.push(vault.toSafeInfo(entry));
        }
      }

      return results;
    },

    getIdentitiesForResource(
      resourceType: string,
      resourceId: string,
      options?: CapabilityQueryOptions
    ): IdentityInfo[] {
      const entries = vault.getAll();
      const results: IdentityInfo[] = [];

      for (const entry of entries) {
        // Filter by gateway if specified
        if (options?.gatewayUrl && entry.gatewayUrl !== options.gatewayUrl) {
          continue;
        }

        // Filter out expired unless explicitly included
        if (!options?.includeExpired && vault.isExpired(entry)) {
          continue;
        }

        // Check if entry has any capability for this resource
        const hasResource = entry.capabilities.some(
          (c) => c.resourceType === resourceType && c.resourceId === resourceId
        );

        if (hasResource) {
          results.push(vault.toSafeInfo(entry));
        }
      }

      return results;
    },

    getCapabilitiesForIdentity(
      identityId: string,
      options?: { resourceType?: string }
    ): VaultCapability[] {
      const entry = vault.getById(identityId);
      if (!entry) {
        return [];
      }

      if (options?.resourceType) {
        return entry.capabilities.filter(
          (c) => c.resourceType === options.resourceType
        );
      }

      return [...entry.capabilities];
    },

    canAccessResource(
      identityId: string,
      capability: string,
      resourceType?: string,
      resourceId?: string
    ): boolean {
      const entry = vault.getById(identityId);
      if (!entry) {
        return false;
      }

      // Check expiration
      if (vault.isExpired(entry)) {
        return false;
      }

      // Find matching capability
      return entry.capabilities.some((c) => {
        if (c.capability !== capability) {
          return false;
        }

        // Non-resource-scoped capability
        if (resourceType === undefined && resourceId === undefined) {
          return c.resourceType === undefined && c.resourceId === undefined;
        }

        // Resource-scoped capability
        return c.resourceType === resourceType && c.resourceId === resourceId;
      });
    },

    getIdentitiesBySource(
      source: IdentitySource,
      options?: SourceQueryOptions
    ): IdentityInfo[] {
      const entries = vault.getAll();
      const results: IdentityInfo[] = [];

      for (const entry of entries) {
        if (entry.source !== source) {
          continue;
        }

        if (options?.gatewayUrl && entry.gatewayUrl !== options.gatewayUrl) {
          continue;
        }

        results.push(vault.toSafeInfo(entry));
      }

      return results;
    },

    groupByGateway(): Record<string, IdentityInfo[]> {
      const entries = vault.getAll();
      const grouped: Record<string, IdentityInfo[]> = {};

      for (const entry of entries) {
        if (!grouped[entry.gatewayUrl]) {
          grouped[entry.gatewayUrl] = [];
        }
        grouped[entry.gatewayUrl].push(vault.toSafeInfo(entry));
      }

      return grouped;
    },

    getSummary(): VaultSummary {
      const entries = vault.getAll();

      // Only expose minimal info to apps - no gateway counts or detailed lists
      return {
        totalIdentities: entries.length,
        hasOwnerIdentity: entries.some((e) => e.source === 'owner'),
      };
    },
  };
}

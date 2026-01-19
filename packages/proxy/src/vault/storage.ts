/**
 * Vault Storage - Multi-identity credential storage operations
 *
 * Provides CRUD operations for managing multiple identities in localStorage.
 */

import type {
  Vault,
  VaultEntry,
  VaultCapability,
  IdentityInfo,
  AddVaultEntryOptions,
} from './types';
import { VAULT_STORAGE_KEY, VAULT_VERSION } from './types';

/**
 * VaultStorage interface for managing identity credentials.
 */
export interface VaultStorage {
  /** Get all vault entries */
  getAll(): VaultEntry[];

  /** Get entry by identity ID */
  getById(identityId: string): VaultEntry | undefined;

  /** Get all entries for a gateway */
  getByGateway(gatewayUrl: string): VaultEntry[];

  /** Get primary identity for a gateway */
  getPrimary(gatewayUrl: string): VaultEntry | undefined;

  /** Set an identity as primary for its gateway */
  setPrimary(identityId: string): void;

  /** Add a new entry to the vault */
  add(options: AddVaultEntryOptions): VaultEntry;

  /** Remove an entry by identity ID */
  remove(identityId: string): void;

  /** Update an existing entry */
  update(identityId: string, updates: Partial<Omit<VaultEntry, 'identityId'>>): void;

  /** Add a capability to an existing entry */
  addCapability(identityId: string, capability: VaultCapability): void;

  /** Get all unique gateway URLs */
  getGateways(): string[];

  /** Clear all entries */
  clear(): void;

  /** Convert entry to safe info (no secrets) */
  toSafeInfo(entry: VaultEntry): IdentityInfo;

  /** Check if an entry is expired */
  isExpired(entry: VaultEntry): boolean;
}

/**
 * Create a vault storage instance.
 *
 * @param storage - Storage backend (defaults to localStorage)
 */
export function createVaultStorage(storage?: Storage): VaultStorage {
  // Use provided storage or default to localStorage (client-side only)
  const resolvedStorage = storage ?? (typeof window !== 'undefined' ? localStorage : null);
  if (!resolvedStorage) {
    throw new Error('No storage available. createVaultStorage must be called in browser context or with an explicit storage parameter.');
  }
  // Assign to const after null check to narrow type
  const actualStorage: Storage = resolvedStorage;

  // Load vault from storage
  function load(): Vault {
    try {
      const raw = actualStorage.getItem(VAULT_STORAGE_KEY);
      if (!raw) {
        return { version: VAULT_VERSION, entries: [] };
      }
      const parsed = JSON.parse(raw) as Vault;
      // Validate structure
      if (!parsed.entries || !Array.isArray(parsed.entries)) {
        return { version: VAULT_VERSION, entries: [] };
      }
      return parsed;
    } catch {
      // Corrupted data, return empty vault
      return { version: VAULT_VERSION, entries: [] };
    }
  }

  // Save vault to storage
  function save(vault: Vault): void {
    actualStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(vault));
  }

  // Get current vault state
  let vault = load();

  return {
    getAll(): VaultEntry[] {
      return [...vault.entries];
    },

    getById(identityId: string): VaultEntry | undefined {
      return vault.entries.find((e) => e.identityId === identityId);
    },

    getByGateway(gatewayUrl: string): VaultEntry[] {
      return vault.entries.filter((e) => e.gatewayUrl === gatewayUrl);
    },

    getPrimary(gatewayUrl: string): VaultEntry | undefined {
      return vault.entries.find(
        (e) => e.gatewayUrl === gatewayUrl && e.isPrimary
      );
    },

    setPrimary(identityId: string): void {
      const entry = vault.entries.find((e) => e.identityId === identityId);
      if (!entry) {
        throw new Error(`Identity not found: ${identityId}`);
      }

      // Unset primary for all entries with same gateway
      vault.entries = vault.entries.map((e) => {
        if (e.gatewayUrl === entry.gatewayUrl) {
          return { ...e, isPrimary: e.identityId === identityId };
        }
        return e;
      });

      save(vault);
    },

    add(options: AddVaultEntryOptions): VaultEntry {
      // Check for duplicate
      if (vault.entries.some((e) => e.identityId === options.identityId)) {
        throw new Error(`Identity already exists: ${options.identityId}`);
      }

      // Check if this is first entry for gateway
      const existingForGateway = vault.entries.filter(
        (e) => e.gatewayUrl === options.gatewayUrl
      );
      const isFirstForGateway = existingForGateway.length === 0;

      // Determine if this should be primary
      const shouldBePrimary = options.forcePrimary || isFirstForGateway;

      // If forcing primary, unset others
      if (options.forcePrimary && !isFirstForGateway) {
        vault.entries = vault.entries.map((e) => {
          if (e.gatewayUrl === options.gatewayUrl) {
            return { ...e, isPrimary: false };
          }
          return e;
        });
      }

      const entry: VaultEntry = {
        identityId: options.identityId,
        displayName: options.displayName,
        identityType: options.identityType,
        gatewayUrl: options.gatewayUrl,
        gatewayDisplayName: options.gatewayDisplayName,
        apiKey: options.apiKey,
        capabilities: options.capabilities || [],
        source: options.source,
        referrer: options.referrer,
        claimedAt: options.claimedAt,
        createdAt: new Date().toISOString(),
        isPrimary: shouldBePrimary,
        expiresAt: options.expiresAt,
      };

      vault.entries.push(entry);
      save(vault);

      return entry;
    },

    remove(identityId: string): void {
      const entry = vault.entries.find((e) => e.identityId === identityId);
      if (!entry) {
        return; // No-op for non-existent
      }

      const wasPrimary = entry.isPrimary;
      const gatewayUrl = entry.gatewayUrl;

      vault.entries = vault.entries.filter((e) => e.identityId !== identityId);

      // If removed entry was primary, promote next entry for same gateway
      if (wasPrimary) {
        const nextForGateway = vault.entries.find(
          (e) => e.gatewayUrl === gatewayUrl
        );
        if (nextForGateway) {
          nextForGateway.isPrimary = true;
        }
      }

      save(vault);
    },

    update(
      identityId: string,
      updates: Partial<Omit<VaultEntry, 'identityId'>>
    ): void {
      const index = vault.entries.findIndex((e) => e.identityId === identityId);
      if (index === -1) {
        throw new Error(`Identity not found: ${identityId}`);
      }

      // Don't allow changing identityId
      const safeUpdates = { ...updates };
      delete (safeUpdates as Record<string, unknown>).identityId;

      vault.entries[index] = { ...vault.entries[index], ...safeUpdates };
      save(vault);
    },

    addCapability(identityId: string, capability: VaultCapability): void {
      const index = vault.entries.findIndex((e) => e.identityId === identityId);
      if (index === -1) {
        throw new Error(`Identity not found: ${identityId}`);
      }

      const entry = vault.entries[index];

      // Check for duplicate (same capability + resourceType + resourceId)
      const isDuplicate = entry.capabilities.some(
        (c) =>
          c.capability === capability.capability &&
          c.resourceType === capability.resourceType &&
          c.resourceId === capability.resourceId
      );

      if (!isDuplicate) {
        entry.capabilities.push(capability);
        save(vault);
      }
    },

    getGateways(): string[] {
      const urls = new Set(vault.entries.map((e) => e.gatewayUrl));
      return [...urls];
    },

    clear(): void {
      vault = { version: VAULT_VERSION, entries: [] };
      save(vault);
    },

    toSafeInfo(entry: VaultEntry): IdentityInfo {
      // Only expose minimal info to apps - no gateway URLs or capabilities
      return {
        identityId: entry.identityId,
        displayName: entry.displayName,
        identityType: entry.identityType,
        source: entry.source,
        isPrimary: entry.isPrimary,
      };
    },

    isExpired(entry: VaultEntry): boolean {
      if (!entry.expiresAt) {
        return false;
      }
      return new Date(entry.expiresAt) < new Date();
    },
  };
}

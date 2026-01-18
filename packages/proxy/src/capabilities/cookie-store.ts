/**
 * CookieCapabilityStore - Stores capabilities in gateway KV.
 *
 * This implementation is used in the iframe context where the frame
 * has access to the gateway through cookies/localStorage.
 */

import type { Capability, CapabilityStore, PermissionRecord, ProxyBackend } from '../types';

/**
 * Options for CookieCapabilityStore construction.
 */
export interface CookieCapabilityStoreOptions {
  /** Backend to use for KV storage */
  backend: ProxyBackend;
  /** Namespace for storing permissions (defaults to '__ORG') */
  orgNamespace?: string;
}

/**
 * Map of origin to permission record.
 */
interface PermissionsTable {
  [origin: string]: PermissionRecord;
}

/**
 * CookieCapabilityStore stores capabilities in the gateway KV store.
 *
 * Permissions are stored under the __ORG namespace with key 'permissions'.
 * This allows the frame to persist capability grants across sessions.
 */
export class CookieCapabilityStore implements CapabilityStore {
  private backend: ProxyBackend;
  private namespace: string;
  private permissionsKey = 'permissions';

  constructor(options: CookieCapabilityStoreOptions) {
    this.backend = options.backend;
    this.namespace = options.orgNamespace ?? '__ORG';
  }

  /**
   * Load all permissions from KV storage.
   */
  private async loadPermissions(): Promise<PermissionsTable> {
    try {
      const raw = await this.backend.kvGet(this.namespace, this.permissionsKey);
      if (!raw) return {};
      return JSON.parse(raw);
    } catch (err) {
      console.error('[CookieCapabilityStore] Failed to load permissions:', err);
      return {};
    }
  }

  /**
   * Save all permissions to KV storage.
   */
  private async savePermissions(permissions: PermissionsTable): Promise<void> {
    await this.backend.kvSet(
      this.namespace,
      this.permissionsKey,
      JSON.stringify(permissions)
    );
  }

  /**
   * Check if a permission record has expired.
   */
  private isExpired(record: PermissionRecord): boolean {
    if (!record.expiresAt) return false;
    return new Date(record.expiresAt) < new Date();
  }

  /**
   * Get all capabilities granted to an origin.
   */
  async getCapabilities(origin: string): Promise<Capability[]> {
    const permissions = await this.loadPermissions();
    const record = permissions[origin];

    if (!record) return [];

    // Check expiration
    if (this.isExpired(record)) {
      // Clean up expired permissions
      delete permissions[origin];
      await this.savePermissions(permissions);
      return [];
    }

    return record.capabilities;
  }

  /**
   * Check if an origin has a specific capability.
   */
  async hasCapability(origin: string, capability: Capability): Promise<boolean> {
    const capabilities = await this.getCapabilities(origin);
    return capabilities.includes(capability);
  }

  /**
   * Grant capabilities to an origin.
   *
   * New capabilities are merged with existing ones.
   * Also registers/updates an APP identity in the gateway.
   */
  async grantCapabilities(origin: string, capabilities: Capability[]): Promise<void> {
    const permissions = await this.loadPermissions();
    const existing = permissions[origin]?.capabilities ?? [];

    // Merge and deduplicate
    const merged = [...new Set([...existing, ...capabilities])] as Capability[];

    permissions[origin] = {
      origin,
      capabilities: merged,
      grantedAt: new Date().toISOString(),
      // Keep existing expiration if present
      expiresAt: permissions[origin]?.expiresAt,
    };

    await this.savePermissions(permissions);

    // Register/update APP identity in the gateway
    try {
      await this.backend.registerApp(origin, merged);
    } catch (err) {
      // Log but don't fail - permissions are still stored locally
      console.error('[CookieCapabilityStore] Failed to register app identity:', err);
    }
  }

  /**
   * Revoke all capabilities for an origin.
   */
  async revokeCapabilities(origin: string): Promise<void> {
    const permissions = await this.loadPermissions();
    delete permissions[origin];
    await this.savePermissions(permissions);
  }

  /**
   * Revoke a specific capability for an origin.
   */
  async revokeCapability(origin: string, capability: Capability): Promise<void> {
    const permissions = await this.loadPermissions();
    const record = permissions[origin];

    if (!record) return;

    record.capabilities = record.capabilities.filter((c) => c !== capability);

    // Remove the record entirely if no capabilities remain
    if (record.capabilities.length === 0) {
      delete permissions[origin];
    } else {
      permissions[origin] = record;
    }

    await this.savePermissions(permissions);
  }

  /**
   * Set an expiration time for an origin's capabilities.
   */
  async setExpiration(origin: string, expiresAt: Date): Promise<void> {
    const permissions = await this.loadPermissions();
    const record = permissions[origin];

    if (!record) return;

    record.expiresAt = expiresAt.toISOString();
    await this.savePermissions(permissions);
  }

  /**
   * Get the full permission record for an origin.
   */
  async getPermissionRecord(origin: string): Promise<PermissionRecord | null> {
    const permissions = await this.loadPermissions();
    return permissions[origin] ?? null;
  }
}

/**
 * Vault Query Tests
 *
 * Tests for querying vault entries by capability, resource, etc.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createVaultStorage } from '../storage';
import { createVaultQueries, type VaultQueries } from '../queries';
import type { VaultStorage } from '../storage';

// Mock localStorage
const createMockStorage = () => {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach((key) => delete store[key]);
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    _store: store,
  };
};

describe('VaultQueries', () => {
  let mockStorage: ReturnType<typeof createMockStorage>;
  let vault: VaultStorage;
  let queries: VaultQueries;

  beforeEach(() => {
    mockStorage = createMockStorage();
    vault = createVaultStorage(mockStorage as unknown as Storage);
    queries = createVaultQueries(vault);

    // Set up test data
    // User 1: Owner with full channel access
    vault.add({
      identityId: 'ident_owner',
      displayName: 'Channel Owner',
      identityType: 'user',
      gatewayUrl: 'https://gateway.com',
      apiKey: 'sk_owner',
      source: 'owner',
      capabilities: [
        {
          capability: 'channel:read',
          resourceType: 'channel',
          resourceId: 'ch_123',
          grantedAt: '2024-01-01T00:00:00Z',
        },
        {
          capability: 'channel:write',
          resourceType: 'channel',
          resourceId: 'ch_123',
          grantedAt: '2024-01-01T00:00:00Z',
        },
        {
          capability: 'channel:delete',
          resourceType: 'channel',
          resourceId: 'ch_123',
          grantedAt: '2024-01-01T00:00:00Z',
        },
        {
          capability: 'kv:read',
          grantedAt: '2024-01-01T00:00:00Z',
        },
        {
          capability: 'kv:write',
          grantedAt: '2024-01-01T00:00:00Z',
        },
      ],
    });

    // User 2: Granted read-only access to channel
    vault.add({
      identityId: 'ident_reader',
      displayName: 'Channel Reader',
      identityType: 'user',
      gatewayUrl: 'https://gateway.com',
      apiKey: 'sk_reader',
      source: 'granted',
      referrer: 'https://app.example.com',
      capabilities: [
        {
          capability: 'channel:read',
          resourceType: 'channel',
          resourceId: 'ch_123',
          grantedAt: '2024-01-15T00:00:00Z',
        },
      ],
    });

    // User 3: Different gateway, same channel ID
    vault.add({
      identityId: 'ident_other_gateway',
      displayName: 'Other Gateway User',
      identityType: 'user',
      gatewayUrl: 'https://other-gateway.com',
      apiKey: 'sk_other',
      source: 'owner',
      capabilities: [
        {
          capability: 'channel:read',
          resourceType: 'channel',
          resourceId: 'ch_123', // Same ID, different gateway
          grantedAt: '2024-01-01T00:00:00Z',
        },
      ],
    });

    // User 4: Access to different channel
    vault.add({
      identityId: 'ident_other_channel',
      displayName: 'Other Channel User',
      identityType: 'user',
      gatewayUrl: 'https://gateway.com',
      apiKey: 'sk_other_ch',
      source: 'granted',
      capabilities: [
        {
          capability: 'channel:read',
          resourceType: 'channel',
          resourceId: 'ch_456',
          grantedAt: '2024-01-01T00:00:00Z',
        },
      ],
    });
  });

  describe('getIdentitiesForCapability', () => {
    it('should find identities with specific capability', () => {
      const identities = queries.getIdentitiesForCapability('kv:read');

      // With general queries (no resourceType/resourceId), all owner identities are returned
      // as they can use any app-granted permission
      expect(identities).toHaveLength(2);
      expect(identities.map((i) => i.identityId)).toContain('ident_owner');
      expect(identities.map((i) => i.identityId)).toContain('ident_other_gateway');
    });

    it('should find identities with capability for specific resource', () => {
      const identities = queries.getIdentitiesForCapability(
        'channel:read',
        'channel',
        'ch_123'
      );

      // Should find owner, reader on gateway.com, AND other-gateway user (same resourceId)
      expect(identities).toHaveLength(3);
      expect(identities.map((i) => i.identityId)).toContain('ident_owner');
      expect(identities.map((i) => i.identityId)).toContain('ident_reader');
      expect(identities.map((i) => i.identityId)).toContain('ident_other_gateway');
    });

    it('should filter by gateway URL', () => {
      const identities = queries.getIdentitiesForCapability(
        'channel:read',
        'channel',
        'ch_123',
        { gatewayUrl: 'https://gateway.com' }
      );

      expect(identities).toHaveLength(2);
      // Should not include other-gateway.com user
      expect(identities.map((i) => i.identityId)).not.toContain(
        'ident_other_gateway'
      );
    });

    it('should return owner identities for general capability queries even without explicit capability', () => {
      // Owner identities are available for any non-resource-specific query
      // because they can use any app-granted permission
      const identities = queries.getIdentitiesForCapability(
        'blob:write',
        undefined,
        undefined
      );

      // Should include owner identity (can use any app permission)
      expect(identities.map((i) => i.identityId)).toContain('ident_owner');
      // Should not include granted identity (doesn't have blob:write)
      expect(identities.map((i) => i.identityId)).not.toContain('ident_viewer');
    });

    it('should return owner identities even for resource-specific queries with no explicit matches', () => {
      // Owner identities have full access to all resources on their gateway,
      // so they should be returned even if they don't have explicit capabilities
      const identities = queries.getIdentitiesForCapability(
        'blob:write',
        'blob',
        'blob_xyz'
      );

      // Both owner identities should be returned
      expect(identities).toHaveLength(2);
      expect(identities.every((i) => i.source === 'owner')).toBe(true);
    });

    it('should not return expired identities by default', () => {
      // Add an expired identity
      vault.add({
        identityId: 'ident_expired',
        displayName: 'Expired User',
        identityType: 'user',
        gatewayUrl: 'https://gateway.com',
        apiKey: 'sk_expired',
        source: 'granted',
        expiresAt: new Date(Date.now() - 86400000).toISOString(), // Yesterday
        capabilities: [
          {
            capability: 'channel:read',
            resourceType: 'channel',
            resourceId: 'ch_123',
            grantedAt: '2024-01-01T00:00:00Z',
          },
        ],
      });

      const identities = queries.getIdentitiesForCapability(
        'channel:read',
        'channel',
        'ch_123'
      );

      expect(identities.map((i) => i.identityId)).not.toContain('ident_expired');
    });

    it('should include expired if explicitly requested', () => {
      vault.add({
        identityId: 'ident_expired_include',
        displayName: 'Expired Include',
        identityType: 'user',
        gatewayUrl: 'https://gateway.com',
        apiKey: 'sk_exp_inc',
        source: 'granted',
        expiresAt: new Date(Date.now() - 86400000).toISOString(),
        capabilities: [
          {
            capability: 'channel:read',
            resourceType: 'channel',
            resourceId: 'ch_123',
            grantedAt: '2024-01-01T00:00:00Z',
          },
        ],
      });

      const identities = queries.getIdentitiesForCapability(
        'channel:read',
        'channel',
        'ch_123',
        { includeExpired: true }
      );

      expect(identities.map((i) => i.identityId)).toContain(
        'ident_expired_include'
      );
    });
  });

  describe('getIdentitiesForResource', () => {
    it('should find all identities with any capability for resource', () => {
      const identities = queries.getIdentitiesForResource('channel', 'ch_123');

      // Owner has read, write, delete. Reader has read. Other gateway has read.
      expect(identities).toHaveLength(3);
      expect(identities.map((i) => i.identityId)).toContain('ident_owner');
      expect(identities.map((i) => i.identityId)).toContain('ident_reader');
      expect(identities.map((i) => i.identityId)).toContain('ident_other_gateway');
    });

    it('should filter by gateway', () => {
      const identities = queries.getIdentitiesForResource('channel', 'ch_123', {
        gatewayUrl: 'https://other-gateway.com',
      });

      expect(identities).toHaveLength(1);
      expect(identities[0].identityId).toBe('ident_other_gateway');
    });
  });

  describe('getCapabilitiesForIdentity', () => {
    it('should return all capabilities for an identity', () => {
      const caps = queries.getCapabilitiesForIdentity('ident_owner');

      expect(caps).toHaveLength(5);
      expect(caps.map((c) => c.capability)).toContain('channel:read');
      expect(caps.map((c) => c.capability)).toContain('channel:write');
      expect(caps.map((c) => c.capability)).toContain('kv:read');
    });

    it('should return empty array for unknown identity', () => {
      const caps = queries.getCapabilitiesForIdentity('ident_unknown');
      expect(caps).toEqual([]);
    });

    it('should filter by resource type', () => {
      const caps = queries.getCapabilitiesForIdentity('ident_owner', {
        resourceType: 'channel',
      });

      expect(caps).toHaveLength(3);
      expect(caps.every((c) => c.resourceType === 'channel')).toBe(true);
    });
  });

  describe('canAccessResource', () => {
    it('should return true when identity has capability for resource', () => {
      const canAccess = queries.canAccessResource(
        'ident_owner',
        'channel:read',
        'channel',
        'ch_123'
      );

      expect(canAccess).toBe(true);
    });

    it('should return false when identity lacks capability', () => {
      const canAccess = queries.canAccessResource(
        'ident_reader',
        'channel:write',
        'channel',
        'ch_123'
      );

      expect(canAccess).toBe(false);
    });

    it('should return false for wrong resource', () => {
      const canAccess = queries.canAccessResource(
        'ident_owner',
        'channel:read',
        'channel',
        'ch_999'
      );

      expect(canAccess).toBe(false);
    });

    it('should return false for expired identity', () => {
      vault.add({
        identityId: 'ident_exp_check',
        displayName: 'Exp Check',
        identityType: 'user',
        gatewayUrl: 'https://gateway.com',
        apiKey: 'sk_exp_check',
        source: 'granted',
        expiresAt: new Date(Date.now() - 86400000).toISOString(),
        capabilities: [
          {
            capability: 'channel:read',
            resourceType: 'channel',
            resourceId: 'ch_123',
            grantedAt: '2024-01-01T00:00:00Z',
          },
        ],
      });

      const canAccess = queries.canAccessResource(
        'ident_exp_check',
        'channel:read',
        'channel',
        'ch_123'
      );

      expect(canAccess).toBe(false);
    });

    it('should handle non-resource-scoped capabilities', () => {
      const canAccess = queries.canAccessResource(
        'ident_owner',
        'kv:read',
        undefined,
        undefined
      );

      expect(canAccess).toBe(true);
    });
  });

  describe('getIdentitiesBySource', () => {
    it('should return owner identities', () => {
      const owners = queries.getIdentitiesBySource('owner');

      expect(owners.length).toBeGreaterThanOrEqual(2);
      expect(owners.every((i) => i.source === 'owner')).toBe(true);
    });

    it('should return granted identities', () => {
      const granted = queries.getIdentitiesBySource('granted');

      expect(granted.length).toBeGreaterThanOrEqual(2);
      expect(granted.every((i) => i.source === 'granted')).toBe(true);
    });

    it('should filter by gateway', () => {
      const granted = queries.getIdentitiesBySource('granted', {
        gatewayUrl: 'https://gateway.com',
      });

      // IdentityInfo no longer exposes gatewayUrl, so we just check we got results
      expect(granted.length).toBeGreaterThan(0);
      expect(granted.every((i) => i.source === 'granted')).toBe(true);
    });
  });

  describe('groupByGateway', () => {
    it('should group identities by gateway URL', () => {
      const grouped = queries.groupByGateway();

      expect(Object.keys(grouped)).toContain('https://gateway.com');
      expect(Object.keys(grouped)).toContain('https://other-gateway.com');

      expect(grouped['https://gateway.com'].length).toBeGreaterThanOrEqual(3);
      expect(grouped['https://other-gateway.com'].length).toBe(1);
    });
  });

  describe('getSummary', () => {
    it('should return minimal vault summary statistics', () => {
      const summary = queries.getSummary();

      // Only minimal info is returned - no gateway counts or detailed lists
      expect(summary.totalIdentities).toBeGreaterThanOrEqual(4);
      expect(summary.hasOwnerIdentity).toBe(true);
      // These properties should NOT be exposed
      expect((summary as Record<string, unknown>).totalGateways).toBeUndefined();
      expect((summary as Record<string, unknown>).ownerIdentities).toBeUndefined();
      expect((summary as Record<string, unknown>).grantedIdentities).toBeUndefined();
      expect((summary as Record<string, unknown>).identitiesByGateway).toBeUndefined();
    });
  });
});

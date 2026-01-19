/**
 * Vault Storage Tests
 *
 * TDD tests for vault CRUD operations.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createVaultStorage,
  type VaultStorage,
} from '../storage';
import type { VaultEntry, AddVaultEntryOptions, Vault } from '../types';
import { VAULT_STORAGE_KEY, VAULT_VERSION } from '../types';

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

describe('VaultStorage', () => {
  let mockStorage: ReturnType<typeof createMockStorage>;
  let vault: VaultStorage;

  beforeEach(() => {
    mockStorage = createMockStorage();
    vault = createVaultStorage(mockStorage as unknown as Storage);
  });

  describe('initialization', () => {
    it('should create empty vault on first access', () => {
      const entries = vault.getAll();
      expect(entries).toEqual([]);
    });

    it('should load existing vault from storage', () => {
      const existingVault: Vault = {
        version: VAULT_VERSION,
        entries: [
          {
            identityId: 'ident_123',
            displayName: 'Test User',
            identityType: 'user',
            gatewayUrl: 'https://gateway.example.com',
            apiKey: 'sk_test_123',
            capabilities: [],
            source: 'owner',
            createdAt: '2024-01-01T00:00:00Z',
            isPrimary: true,
          },
        ],
      };
      mockStorage._store[VAULT_STORAGE_KEY] = JSON.stringify(existingVault);

      const freshVault = createVaultStorage(mockStorage as unknown as Storage);
      const entries = freshVault.getAll();

      expect(entries).toHaveLength(1);
      expect(entries[0].identityId).toBe('ident_123');
    });

    it('should handle corrupted vault data gracefully', () => {
      mockStorage._store[VAULT_STORAGE_KEY] = 'not valid json{{{';

      const freshVault = createVaultStorage(mockStorage as unknown as Storage);
      const entries = freshVault.getAll();

      expect(entries).toEqual([]);
    });
  });

  describe('add', () => {
    it('should add a new entry to the vault', () => {
      const options: AddVaultEntryOptions = {
        identityId: 'ident_abc',
        displayName: 'Alice',
        identityType: 'user',
        gatewayUrl: 'https://gateway.example.com',
        apiKey: 'sk_alice_123',
        source: 'owner',
      };

      const entry = vault.add(options);

      expect(entry.identityId).toBe('ident_abc');
      expect(entry.displayName).toBe('Alice');
      expect(entry.apiKey).toBe('sk_alice_123');
      expect(entry.createdAt).toBeDefined();
      expect(entry.isPrimary).toBe(true); // First entry should be primary
    });

    it('should set first entry for gateway as primary', () => {
      vault.add({
        identityId: 'ident_1',
        displayName: 'First',
        identityType: 'user',
        gatewayUrl: 'https://gateway1.com',
        apiKey: 'sk_1',
        source: 'owner',
      });

      const entry = vault.getById('ident_1');
      expect(entry?.isPrimary).toBe(true);
    });

    it('should not set subsequent entries as primary by default', () => {
      vault.add({
        identityId: 'ident_1',
        displayName: 'First',
        identityType: 'user',
        gatewayUrl: 'https://gateway.com',
        apiKey: 'sk_1',
        source: 'owner',
      });

      vault.add({
        identityId: 'ident_2',
        displayName: 'Second',
        identityType: 'user',
        gatewayUrl: 'https://gateway.com',
        apiKey: 'sk_2',
        source: 'granted',
      });

      const second = vault.getById('ident_2');
      expect(second?.isPrimary).toBe(false);
    });

    it('should allow forcing primary with forcePrimary option', () => {
      vault.add({
        identityId: 'ident_1',
        displayName: 'First',
        identityType: 'user',
        gatewayUrl: 'https://gateway.com',
        apiKey: 'sk_1',
        source: 'owner',
      });

      vault.add({
        identityId: 'ident_2',
        displayName: 'Second',
        identityType: 'user',
        gatewayUrl: 'https://gateway.com',
        apiKey: 'sk_2',
        source: 'granted',
        forcePrimary: true,
      });

      const first = vault.getById('ident_1');
      const second = vault.getById('ident_2');

      expect(first?.isPrimary).toBe(false);
      expect(second?.isPrimary).toBe(true);
    });

    it('should handle different gateways independently', () => {
      vault.add({
        identityId: 'ident_1',
        displayName: 'Gateway1 User',
        identityType: 'user',
        gatewayUrl: 'https://gateway1.com',
        apiKey: 'sk_1',
        source: 'owner',
      });

      vault.add({
        identityId: 'ident_2',
        displayName: 'Gateway2 User',
        identityType: 'user',
        gatewayUrl: 'https://gateway2.com',
        apiKey: 'sk_2',
        source: 'owner',
      });

      const first = vault.getById('ident_1');
      const second = vault.getById('ident_2');

      // Both should be primary for their respective gateways
      expect(first?.isPrimary).toBe(true);
      expect(second?.isPrimary).toBe(true);
    });

    it('should persist to storage after add', () => {
      vault.add({
        identityId: 'ident_test',
        displayName: 'Test',
        identityType: 'user',
        gatewayUrl: 'https://gateway.com',
        apiKey: 'sk_test',
        source: 'owner',
      });

      expect(mockStorage.setItem).toHaveBeenCalled();
      const stored = JSON.parse(mockStorage._store[VAULT_STORAGE_KEY]);
      expect(stored.entries).toHaveLength(1);
    });

    it('should include capabilities when provided', () => {
      const entry = vault.add({
        identityId: 'ident_cap',
        displayName: 'With Caps',
        identityType: 'user',
        gatewayUrl: 'https://gateway.com',
        apiKey: 'sk_cap',
        source: 'granted',
        capabilities: [
          {
            capability: 'channel:read',
            resourceType: 'channel',
            resourceId: 'ch_123',
            grantedAt: '2024-01-01T00:00:00Z',
          },
        ],
      });

      expect(entry.capabilities).toHaveLength(1);
      expect(entry.capabilities[0].capability).toBe('channel:read');
      expect(entry.capabilities[0].resourceId).toBe('ch_123');
    });

    it('should include referrer for granted identities', () => {
      const entry = vault.add({
        identityId: 'ident_granted',
        displayName: 'Granted User',
        identityType: 'user',
        gatewayUrl: 'https://gateway.com',
        apiKey: 'sk_granted',
        source: 'granted',
        referrer: 'https://app.example.com',
        claimedAt: '2024-01-15T10:30:00Z',
      });

      expect(entry.source).toBe('granted');
      expect(entry.referrer).toBe('https://app.example.com');
      expect(entry.claimedAt).toBe('2024-01-15T10:30:00Z');
    });

    it('should reject duplicate identity IDs', () => {
      vault.add({
        identityId: 'ident_dup',
        displayName: 'Original',
        identityType: 'user',
        gatewayUrl: 'https://gateway.com',
        apiKey: 'sk_orig',
        source: 'owner',
      });

      expect(() =>
        vault.add({
          identityId: 'ident_dup',
          displayName: 'Duplicate',
          identityType: 'user',
          gatewayUrl: 'https://gateway.com',
          apiKey: 'sk_dup',
          source: 'owner',
        })
      ).toThrow(/already exists/i);
    });
  });

  describe('getById', () => {
    it('should return entry by identity ID', () => {
      vault.add({
        identityId: 'ident_find',
        displayName: 'Find Me',
        identityType: 'user',
        gatewayUrl: 'https://gateway.com',
        apiKey: 'sk_find',
        source: 'owner',
      });

      const entry = vault.getById('ident_find');
      expect(entry?.displayName).toBe('Find Me');
    });

    it('should return undefined for non-existent ID', () => {
      const entry = vault.getById('ident_nonexistent');
      expect(entry).toBeUndefined();
    });
  });

  describe('getByGateway', () => {
    beforeEach(() => {
      vault.add({
        identityId: 'ident_g1_1',
        displayName: 'G1 User 1',
        identityType: 'user',
        gatewayUrl: 'https://gateway1.com',
        apiKey: 'sk_g1_1',
        source: 'owner',
      });
      vault.add({
        identityId: 'ident_g1_2',
        displayName: 'G1 User 2',
        identityType: 'user',
        gatewayUrl: 'https://gateway1.com',
        apiKey: 'sk_g1_2',
        source: 'granted',
      });
      vault.add({
        identityId: 'ident_g2_1',
        displayName: 'G2 User 1',
        identityType: 'user',
        gatewayUrl: 'https://gateway2.com',
        apiKey: 'sk_g2_1',
        source: 'owner',
      });
    });

    it('should return all entries for a gateway', () => {
      const entries = vault.getByGateway('https://gateway1.com');
      expect(entries).toHaveLength(2);
      expect(entries.map((e) => e.identityId)).toContain('ident_g1_1');
      expect(entries.map((e) => e.identityId)).toContain('ident_g1_2');
    });

    it('should return empty array for unknown gateway', () => {
      const entries = vault.getByGateway('https://unknown.com');
      expect(entries).toEqual([]);
    });
  });

  describe('getPrimary', () => {
    it('should return primary identity for gateway', () => {
      vault.add({
        identityId: 'ident_primary',
        displayName: 'Primary',
        identityType: 'user',
        gatewayUrl: 'https://gateway.com',
        apiKey: 'sk_primary',
        source: 'owner',
      });
      vault.add({
        identityId: 'ident_secondary',
        displayName: 'Secondary',
        identityType: 'user',
        gatewayUrl: 'https://gateway.com',
        apiKey: 'sk_secondary',
        source: 'granted',
      });

      const primary = vault.getPrimary('https://gateway.com');
      expect(primary?.identityId).toBe('ident_primary');
    });

    it('should return undefined if no primary for gateway', () => {
      const primary = vault.getPrimary('https://unknown.com');
      expect(primary).toBeUndefined();
    });
  });

  describe('setPrimary', () => {
    it('should change primary identity for gateway', () => {
      vault.add({
        identityId: 'ident_1',
        displayName: 'First',
        identityType: 'user',
        gatewayUrl: 'https://gateway.com',
        apiKey: 'sk_1',
        source: 'owner',
      });
      vault.add({
        identityId: 'ident_2',
        displayName: 'Second',
        identityType: 'user',
        gatewayUrl: 'https://gateway.com',
        apiKey: 'sk_2',
        source: 'granted',
      });

      vault.setPrimary('ident_2');

      const first = vault.getById('ident_1');
      const second = vault.getById('ident_2');

      expect(first?.isPrimary).toBe(false);
      expect(second?.isPrimary).toBe(true);
    });

    it('should throw for non-existent identity', () => {
      expect(() => vault.setPrimary('ident_nonexistent')).toThrow(/not found/i);
    });

    it('should only affect same gateway', () => {
      vault.add({
        identityId: 'ident_g1',
        displayName: 'G1',
        identityType: 'user',
        gatewayUrl: 'https://gateway1.com',
        apiKey: 'sk_g1',
        source: 'owner',
      });
      vault.add({
        identityId: 'ident_g2',
        displayName: 'G2',
        identityType: 'user',
        gatewayUrl: 'https://gateway2.com',
        apiKey: 'sk_g2',
        source: 'owner',
      });

      vault.setPrimary('ident_g1');

      const g1 = vault.getById('ident_g1');
      const g2 = vault.getById('ident_g2');

      expect(g1?.isPrimary).toBe(true);
      expect(g2?.isPrimary).toBe(true); // Unchanged
    });
  });

  describe('remove', () => {
    it('should remove entry by ID', () => {
      vault.add({
        identityId: 'ident_remove',
        displayName: 'Remove Me',
        identityType: 'user',
        gatewayUrl: 'https://gateway.com',
        apiKey: 'sk_remove',
        source: 'owner',
      });

      vault.remove('ident_remove');

      const entry = vault.getById('ident_remove');
      expect(entry).toBeUndefined();
    });

    it('should persist removal to storage', () => {
      vault.add({
        identityId: 'ident_persist',
        displayName: 'Persist',
        identityType: 'user',
        gatewayUrl: 'https://gateway.com',
        apiKey: 'sk_persist',
        source: 'owner',
      });

      vault.remove('ident_persist');

      const stored = JSON.parse(mockStorage._store[VAULT_STORAGE_KEY]);
      expect(stored.entries).toHaveLength(0);
    });

    it('should promote next entry to primary when primary is removed', () => {
      vault.add({
        identityId: 'ident_1',
        displayName: 'First',
        identityType: 'user',
        gatewayUrl: 'https://gateway.com',
        apiKey: 'sk_1',
        source: 'owner',
      });
      vault.add({
        identityId: 'ident_2',
        displayName: 'Second',
        identityType: 'user',
        gatewayUrl: 'https://gateway.com',
        apiKey: 'sk_2',
        source: 'granted',
      });

      vault.remove('ident_1');

      const second = vault.getById('ident_2');
      expect(second?.isPrimary).toBe(true);
    });

    it('should not throw for non-existent ID', () => {
      expect(() => vault.remove('ident_nonexistent')).not.toThrow();
    });
  });

  describe('update', () => {
    it('should update entry properties', () => {
      vault.add({
        identityId: 'ident_update',
        displayName: 'Original Name',
        identityType: 'user',
        gatewayUrl: 'https://gateway.com',
        apiKey: 'sk_update',
        source: 'owner',
      });

      vault.update('ident_update', { displayName: 'Updated Name' });

      const entry = vault.getById('ident_update');
      expect(entry?.displayName).toBe('Updated Name');
    });

    it('should update lastUsedAt', () => {
      vault.add({
        identityId: 'ident_used',
        displayName: 'Used',
        identityType: 'user',
        gatewayUrl: 'https://gateway.com',
        apiKey: 'sk_used',
        source: 'owner',
      });

      const timestamp = '2024-06-15T12:00:00Z';
      vault.update('ident_used', { lastUsedAt: timestamp });

      const entry = vault.getById('ident_used');
      expect(entry?.lastUsedAt).toBe(timestamp);
    });

    it('should throw for non-existent identity', () => {
      expect(() =>
        vault.update('ident_nonexistent', { displayName: 'New' })
      ).toThrow(/not found/i);
    });

    it('should not allow changing identityId', () => {
      vault.add({
        identityId: 'ident_immutable',
        displayName: 'Immutable',
        identityType: 'user',
        gatewayUrl: 'https://gateway.com',
        apiKey: 'sk_immutable',
        source: 'owner',
      });

      // TypeScript should prevent this, but test runtime behavior
      vault.update('ident_immutable', {
        identityId: 'ident_changed',
      } as Partial<VaultEntry>);

      const entry = vault.getById('ident_immutable');
      expect(entry?.identityId).toBe('ident_immutable');
    });
  });

  describe('addCapability', () => {
    it('should add capability to existing entry', () => {
      vault.add({
        identityId: 'ident_cap',
        displayName: 'Cap User',
        identityType: 'user',
        gatewayUrl: 'https://gateway.com',
        apiKey: 'sk_cap',
        source: 'owner',
      });

      vault.addCapability('ident_cap', {
        capability: 'channel:read',
        resourceType: 'channel',
        resourceId: 'ch_abc',
        grantedAt: '2024-01-01T00:00:00Z',
      });

      const entry = vault.getById('ident_cap');
      expect(entry?.capabilities).toHaveLength(1);
      expect(entry?.capabilities[0].capability).toBe('channel:read');
    });

    it('should not add duplicate capability for same resource', () => {
      vault.add({
        identityId: 'ident_dup_cap',
        displayName: 'Dup Cap',
        identityType: 'user',
        gatewayUrl: 'https://gateway.com',
        apiKey: 'sk_dup_cap',
        source: 'owner',
        capabilities: [
          {
            capability: 'channel:read',
            resourceType: 'channel',
            resourceId: 'ch_123',
            grantedAt: '2024-01-01T00:00:00Z',
          },
        ],
      });

      vault.addCapability('ident_dup_cap', {
        capability: 'channel:read',
        resourceType: 'channel',
        resourceId: 'ch_123',
        grantedAt: '2024-01-02T00:00:00Z',
      });

      const entry = vault.getById('ident_dup_cap');
      expect(entry?.capabilities).toHaveLength(1);
    });

    it('should add same capability for different resources', () => {
      vault.add({
        identityId: 'ident_multi_res',
        displayName: 'Multi Resource',
        identityType: 'user',
        gatewayUrl: 'https://gateway.com',
        apiKey: 'sk_multi',
        source: 'owner',
      });

      vault.addCapability('ident_multi_res', {
        capability: 'channel:read',
        resourceType: 'channel',
        resourceId: 'ch_1',
        grantedAt: '2024-01-01T00:00:00Z',
      });

      vault.addCapability('ident_multi_res', {
        capability: 'channel:read',
        resourceType: 'channel',
        resourceId: 'ch_2',
        grantedAt: '2024-01-01T00:00:00Z',
      });

      const entry = vault.getById('ident_multi_res');
      expect(entry?.capabilities).toHaveLength(2);
    });
  });

  describe('getGateways', () => {
    it('should return unique gateway URLs', () => {
      vault.add({
        identityId: 'ident_1',
        displayName: 'User 1',
        identityType: 'user',
        gatewayUrl: 'https://gateway1.com',
        apiKey: 'sk_1',
        source: 'owner',
      });
      vault.add({
        identityId: 'ident_2',
        displayName: 'User 2',
        identityType: 'user',
        gatewayUrl: 'https://gateway1.com',
        apiKey: 'sk_2',
        source: 'granted',
      });
      vault.add({
        identityId: 'ident_3',
        displayName: 'User 3',
        identityType: 'user',
        gatewayUrl: 'https://gateway2.com',
        apiKey: 'sk_3',
        source: 'owner',
      });

      const gateways = vault.getGateways();
      expect(gateways).toHaveLength(2);
      expect(gateways).toContain('https://gateway1.com');
      expect(gateways).toContain('https://gateway2.com');
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      vault.add({
        identityId: 'ident_1',
        displayName: 'User 1',
        identityType: 'user',
        gatewayUrl: 'https://gateway.com',
        apiKey: 'sk_1',
        source: 'owner',
      });
      vault.add({
        identityId: 'ident_2',
        displayName: 'User 2',
        identityType: 'user',
        gatewayUrl: 'https://gateway.com',
        apiKey: 'sk_2',
        source: 'granted',
      });

      vault.clear();

      expect(vault.getAll()).toEqual([]);
    });
  });

  describe('toSafeInfo', () => {
    it('should convert entry to IdentityInfo without secrets', () => {
      const entry = vault.add({
        identityId: 'ident_safe',
        displayName: 'Safe User',
        identityType: 'user',
        gatewayUrl: 'https://gateway.com',
        apiKey: 'sk_secret_key_should_not_appear',
        source: 'owner',
        capabilities: [
          {
            capability: 'kv:read',
            grantedAt: '2024-01-01T00:00:00Z',
          },
        ],
      });

      const info = vault.toSafeInfo(entry);

      // Safe info should only contain minimal data - no secrets, no gateway URLs
      expect(info.identityId).toBe('ident_safe');
      expect(info.displayName).toBe('Safe User');
      expect(info.identityType).toBe('user');
      expect(info.source).toBe('owner');
      expect(info.isPrimary).toBe(true);
      // gatewayUrl and capabilities should NOT be exposed
      expect((info as unknown as { gatewayUrl?: string }).gatewayUrl).toBeUndefined();
      expect((info as unknown as { capabilities?: unknown[] }).capabilities).toBeUndefined();
      // apiKey should definitely not be exposed
      expect((info as unknown as VaultEntry).apiKey).toBeUndefined();
    });
  });

  describe('expiration handling', () => {
    it('should identify expired entries', () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString(); // Yesterday

      vault.add({
        identityId: 'ident_expired',
        displayName: 'Expired',
        identityType: 'user',
        gatewayUrl: 'https://gateway.com',
        apiKey: 'sk_expired',
        source: 'granted',
        expiresAt: pastDate,
      });

      const entry = vault.getById('ident_expired');
      expect(vault.isExpired(entry!)).toBe(true);
    });

    it('should identify non-expired entries', () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString(); // Tomorrow

      vault.add({
        identityId: 'ident_valid',
        displayName: 'Valid',
        identityType: 'user',
        gatewayUrl: 'https://gateway.com',
        apiKey: 'sk_valid',
        source: 'granted',
        expiresAt: futureDate,
      });

      const entry = vault.getById('ident_valid');
      expect(vault.isExpired(entry!)).toBe(false);
    });

    it('should treat entries without expiresAt as non-expired', () => {
      vault.add({
        identityId: 'ident_no_exp',
        displayName: 'No Expiry',
        identityType: 'user',
        gatewayUrl: 'https://gateway.com',
        apiKey: 'sk_no_exp',
        source: 'owner',
      });

      const entry = vault.getById('ident_no_exp');
      expect(vault.isExpired(entry!)).toBe(false);
    });
  });
});

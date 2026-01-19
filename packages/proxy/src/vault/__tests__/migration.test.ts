/**
 * Vault Migration Tests
 *
 * Tests for migrating from single-credential storage to vault format.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { migrateToVault, needsMigration } from '../migration';
import { VAULT_STORAGE_KEY, LEGACY_API_KEY, LEGACY_GATEWAY_URL } from '../types';

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

describe('Vault Migration', () => {
  let mockStorage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    mockStorage = createMockStorage();
  });

  describe('needsMigration', () => {
    it('should return true when legacy keys exist but no vault', () => {
      mockStorage._store[LEGACY_API_KEY] = 'sk_test_123';
      mockStorage._store[LEGACY_GATEWAY_URL] = 'https://gateway.example.com';

      const result = needsMigration(mockStorage as unknown as Storage);
      expect(result).toBe(true);
    });

    it('should return false when vault already exists', () => {
      mockStorage._store[LEGACY_API_KEY] = 'sk_test_123';
      mockStorage._store[LEGACY_GATEWAY_URL] = 'https://gateway.example.com';
      mockStorage._store[VAULT_STORAGE_KEY] = JSON.stringify({
        version: 1,
        entries: [],
      });

      const result = needsMigration(mockStorage as unknown as Storage);
      expect(result).toBe(false);
    });

    it('should return false when no legacy keys exist', () => {
      const result = needsMigration(mockStorage as unknown as Storage);
      expect(result).toBe(false);
    });

    it('should return false when only API key exists (incomplete)', () => {
      mockStorage._store[LEGACY_API_KEY] = 'sk_test_123';

      const result = needsMigration(mockStorage as unknown as Storage);
      expect(result).toBe(false);
    });

    it('should return false when only URL exists (incomplete)', () => {
      mockStorage._store[LEGACY_GATEWAY_URL] = 'https://gateway.example.com';

      const result = needsMigration(mockStorage as unknown as Storage);
      expect(result).toBe(false);
    });
  });

  describe('migrateToVault', () => {
    it('should migrate legacy credentials to vault format', () => {
      mockStorage._store[LEGACY_API_KEY] = 'sk_migrated_123';
      mockStorage._store[LEGACY_GATEWAY_URL] = 'https://gateway.example.com';

      const result = migrateToVault(mockStorage as unknown as Storage);

      expect(result.success).toBe(true);
      expect(result.entriesCreated).toBe(1);

      // Check vault was created
      const vault = JSON.parse(mockStorage._store[VAULT_STORAGE_KEY]);
      expect(vault.version).toBe(1);
      expect(vault.entries).toHaveLength(1);

      const entry = vault.entries[0];
      expect(entry.apiKey).toBe('sk_migrated_123');
      expect(entry.gatewayUrl).toBe('https://gateway.example.com');
      expect(entry.source).toBe('owner');
      expect(entry.isPrimary).toBe(true);
      expect(entry.identityId).toBe('migrated_identity');
      expect(entry.displayName).toBe('Primary Identity');
    });

    it('should not migrate if vault already exists', () => {
      mockStorage._store[LEGACY_API_KEY] = 'sk_test';
      mockStorage._store[LEGACY_GATEWAY_URL] = 'https://gateway.com';
      mockStorage._store[VAULT_STORAGE_KEY] = JSON.stringify({
        version: 1,
        entries: [{ identityId: 'existing' }],
      });

      const result = migrateToVault(mockStorage as unknown as Storage);

      expect(result.success).toBe(false);
      expect(result.reason).toMatch(/already exists/i);
    });

    it('should not migrate if legacy keys are missing', () => {
      const result = migrateToVault(mockStorage as unknown as Storage);

      expect(result.success).toBe(false);
      expect(result.reason).toMatch(/no legacy/i);
    });

    it('should preserve legacy keys after migration (for backward compat)', () => {
      mockStorage._store[LEGACY_API_KEY] = 'sk_preserved';
      mockStorage._store[LEGACY_GATEWAY_URL] = 'https://gateway.com';

      migrateToVault(mockStorage as unknown as Storage);

      // Legacy keys should still exist
      expect(mockStorage._store[LEGACY_API_KEY]).toBe('sk_preserved');
      expect(mockStorage._store[LEGACY_GATEWAY_URL]).toBe('https://gateway.com');
    });

    it('should set createdAt to current timestamp', () => {
      mockStorage._store[LEGACY_API_KEY] = 'sk_time';
      mockStorage._store[LEGACY_GATEWAY_URL] = 'https://gateway.com';

      const before = new Date();
      migrateToVault(mockStorage as unknown as Storage);
      const after = new Date();

      const vault = JSON.parse(mockStorage._store[VAULT_STORAGE_KEY]);
      const createdAt = new Date(vault.entries[0].createdAt);

      expect(createdAt >= before).toBe(true);
      expect(createdAt <= after).toBe(true);
    });

    it('should set identityType to user for migrated entries', () => {
      mockStorage._store[LEGACY_API_KEY] = 'sk_type';
      mockStorage._store[LEGACY_GATEWAY_URL] = 'https://gateway.com';

      migrateToVault(mockStorage as unknown as Storage);

      const vault = JSON.parse(mockStorage._store[VAULT_STORAGE_KEY]);
      expect(vault.entries[0].identityType).toBe('user');
    });

    it('should initialize empty capabilities array', () => {
      mockStorage._store[LEGACY_API_KEY] = 'sk_caps';
      mockStorage._store[LEGACY_GATEWAY_URL] = 'https://gateway.com';

      migrateToVault(mockStorage as unknown as Storage);

      const vault = JSON.parse(mockStorage._store[VAULT_STORAGE_KEY]);
      expect(vault.entries[0].capabilities).toEqual([]);
    });
  });

  describe('migration with cookies', () => {
    it('should support migrating from cookie values', () => {
      // Simulate a scenario where values come from cookies
      const cookieApiKey = 'sk_from_cookie';
      const cookieUrl = 'https://cookie-gateway.com';

      mockStorage._store[LEGACY_API_KEY] = cookieApiKey;
      mockStorage._store[LEGACY_GATEWAY_URL] = cookieUrl;

      const result = migrateToVault(mockStorage as unknown as Storage);

      expect(result.success).toBe(true);
      const vault = JSON.parse(mockStorage._store[VAULT_STORAGE_KEY]);
      expect(vault.entries[0].apiKey).toBe(cookieApiKey);
      expect(vault.entries[0].gatewayUrl).toBe(cookieUrl);
    });
  });
});

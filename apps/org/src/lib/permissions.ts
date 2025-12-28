import type { Capability, PermissionRecord, PermissionsTable } from './protocol';
import { createGatewayClient, withAuth } from '../api/client';
import { getGatewayConfig } from '../utils/auth';

const KV_NAMESPACE = '__ORG';
const KV_KEY = 'permissions';
const LOCALSTORAGE_KEY = 'federise:permissions';

// In-memory cache for fast synchronous access
let permissionsCache: PermissionsTable = {};
let isInitialized = false;

/**
 * Load permissions from localStorage cache
 */
function loadFromLocalStorage(): PermissionsTable {
  const stored = localStorage.getItem(LOCALSTORAGE_KEY);
  if (!stored) return {};
  try {
    return JSON.parse(stored) as PermissionsTable;
  } catch {
    return {};
  }
}

/**
 * Save permissions to localStorage cache
 */
function saveToLocalStorage(table: PermissionsTable): void {
  localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(table));
}

/**
 * Initialize permissions from the gateway KV store with localStorage fallback
 * Should be called on app startup
 */
export async function initPermissions(): Promise<void> {
  const { apiKey, url } = getGatewayConfig();

  // Always load from localStorage first (for offline support)
  permissionsCache = loadFromLocalStorage();

  if (!apiKey || !url) {
    // Gateway not configured, use localStorage cache
    isInitialized = true;
    return;
  }

  try {
    // Try to get the latest from KV (source of truth)
    const client = createGatewayClient(url);
    const { data } = await client.POST('/kv/get', {
      ...withAuth(apiKey),
      body: { namespace: KV_NAMESPACE, key: KV_KEY },
    });

    if (data?.value) {
      // KV is the source of truth - use it and update cache
      permissionsCache = JSON.parse(data.value) as PermissionsTable;
      saveToLocalStorage(permissionsCache);
      console.log('[Permissions] Loaded from gateway KV');
    } else {
      // No data in KV yet, but we have localStorage cache
      console.log('[Permissions] No data in gateway KV, using localStorage cache');
    }
  } catch (err) {
    // Failed to reach gateway (offline?), use localStorage cache
    console.warn('[Permissions] Failed to load from gateway, using localStorage cache:', err);
  }

  isInitialized = true;
}

export function getPermissionsTable(): PermissionsTable {
  if (!isInitialized) {
    console.warn('Permissions not initialized. Call initPermissions() first.');
  }
  return permissionsCache;
}

export function savePermissionsTable(table: PermissionsTable): void {
  permissionsCache = table;

  // Always save to localStorage cache immediately (for offline support)
  saveToLocalStorage(table);

  // Also save to gateway KV asynchronously (fire and forget)
  const { apiKey, url } = getGatewayConfig();
  if (apiKey && url) {
    const client = createGatewayClient(url);
    client.POST('/kv/set', {
      ...withAuth(apiKey),
      body: {
        namespace: KV_NAMESPACE,
        key: KV_KEY,
        value: JSON.stringify(table),
      },
    }).then(() => {
      console.log('[Permissions] Saved to gateway KV');
    }).catch(err => {
      console.error('[Permissions] Failed to save to gateway KV:', err);
    });
  }
}

export function getPermissions(origin: string): PermissionRecord | null {
  const table = getPermissionsTable();
  return table[origin] ?? null;
}

export function setPermissions(origin: string, record: PermissionRecord): void {
  const table = getPermissionsTable();
  table[origin] = record;
  savePermissionsTable(table);
}

export function hasCapability(origin: string, capability: Capability): boolean {
  const record = getPermissions(origin);
  if (!record) return false;

  // Check expiration
  if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
    return false;
  }

  return record.capabilities.includes(capability);
}

export function grantCapabilities(origin: string, capabilities: Capability[]): PermissionRecord {
  const existing = getPermissions(origin);
  const existingCaps = existing?.capabilities ?? [];
  const merged = [...new Set([...existingCaps, ...capabilities])];

  const record: PermissionRecord = {
    origin,
    capabilities: merged,
    grantedAt: new Date().toISOString(),
  };

  setPermissions(origin, record);
  return record;
}

export function revokePermissions(origin: string): void {
  const table = getPermissionsTable();
  delete table[origin];
  savePermissionsTable(table);
}

export function revokeCapability(origin: string, capability: Capability): void {
  const record = getPermissions(origin);
  if (!record) return;

  record.capabilities = record.capabilities.filter((c) => c !== capability);

  if (record.capabilities.length === 0) {
    revokePermissions(origin);
  } else {
    setPermissions(origin, record);
  }
}

export function getAllPermissions(): PermissionRecord[] {
  const table = getPermissionsTable();
  return Object.values(table);
}

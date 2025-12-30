import type { Capability, PermissionRecord, PermissionsTable } from './protocol';
import { createGatewayClient, withAuth } from '../api/client';
import { getGatewayConfig } from '../utils/auth';

const KV_NAMESPACE = '__ORG';
const KV_KEY = 'permissions';

/**
 * Get the gateway client and auth config.
 * Throws if gateway is not configured.
 */
function getClient() {
  const { apiKey, url } = getGatewayConfig();
  if (!apiKey || !url) {
    throw new Error('Gateway not configured');
  }
  return { client: createGatewayClient(url), apiKey };
}

/**
 * Load the entire permissions table from KV.
 */
async function loadPermissionsTable(): Promise<PermissionsTable> {
  const { client, apiKey } = getClient();

  const { data, error } = await client.POST('/kv/get', {
    ...withAuth(apiKey),
    body: { namespace: KV_NAMESPACE, key: KV_KEY },
  });

  if (error) {
    throw new Error('Failed to load permissions from KV');
  }

  if (!data?.value) {
    return {};
  }

  try {
    return JSON.parse(data.value) as PermissionsTable;
  } catch {
    return {};
  }
}

/**
 * Save the entire permissions table to KV.
 */
async function savePermissionsTable(table: PermissionsTable): Promise<void> {
  const { client, apiKey } = getClient();

  const { error } = await client.POST('/kv/set', {
    ...withAuth(apiKey),
    body: {
      namespace: KV_NAMESPACE,
      key: KV_KEY,
      value: JSON.stringify(table),
    },
  });

  if (error) {
    throw new Error('Failed to save permissions to KV');
  }
}

/**
 * Get permissions for a specific origin.
 */
export async function getPermissions(origin: string): Promise<PermissionRecord | null> {
  const table = await loadPermissionsTable();
  return table[origin] ?? null;
}

/**
 * Set permissions for a specific origin.
 */
export async function setPermissions(origin: string, record: PermissionRecord): Promise<void> {
  const table = await loadPermissionsTable();
  table[origin] = record;
  await savePermissionsTable(table);
}

/**
 * Check if an origin has a specific capability.
 */
export async function hasCapability(origin: string, capability: Capability): Promise<boolean> {
  const record = await getPermissions(origin);
  if (!record) return false;

  // Check expiration
  if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
    return false;
  }

  return record.capabilities.includes(capability);
}

/**
 * Grant capabilities to an origin. Merges with existing capabilities.
 */
export async function grantCapabilities(origin: string, capabilities: Capability[]): Promise<PermissionRecord> {
  const existing = await getPermissions(origin);
  const existingCaps = existing?.capabilities ?? [];
  const merged = [...new Set([...existingCaps, ...capabilities])];

  const record: PermissionRecord = {
    origin,
    capabilities: merged,
    grantedAt: new Date().toISOString(),
  };

  await setPermissions(origin, record);
  return record;
}

/**
 * Revoke all permissions for an origin.
 */
export async function revokePermissions(origin: string): Promise<void> {
  const table = await loadPermissionsTable();
  delete table[origin];
  await savePermissionsTable(table);
}

/**
 * Revoke a specific capability from an origin.
 */
export async function revokeCapability(origin: string, capability: Capability): Promise<void> {
  const record = await getPermissions(origin);
  if (!record) return;

  record.capabilities = record.capabilities.filter((c) => c !== capability);

  if (record.capabilities.length === 0) {
    await revokePermissions(origin);
  } else {
    await setPermissions(origin, record);
  }
}

/**
 * Get all permission records.
 */
export async function getAllPermissions(): Promise<PermissionRecord[]> {
  const table = await loadPermissionsTable();
  return Object.values(table);
}

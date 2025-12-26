import type { Capability, PermissionRecord, PermissionsTable } from './protocol';

const PERMISSIONS_KEY = 'federise:permissions';

export function getPermissionsTable(): PermissionsTable {
  const stored = localStorage.getItem(PERMISSIONS_KEY);
  if (!stored) return {};
  try {
    return JSON.parse(stored) as PermissionsTable;
  } catch {
    return {};
  }
}

export function savePermissionsTable(table: PermissionsTable): void {
  localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(table));
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

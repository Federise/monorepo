const KV_PREFIX = 'federise:kv';

// Simple hash function for origin namespacing
function hashOrigin(origin: string): string {
  let hash = 0;
  for (let i = 0; i < origin.length; i++) {
    const char = origin.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

function buildStorageKey(origin: string, key: string): string {
  return `${KV_PREFIX}:${hashOrigin(origin)}:${key}`;
}

export function getKV(origin: string, key: string): string | null {
  const storageKey = buildStorageKey(origin, key);
  return localStorage.getItem(storageKey);
}

export function setKV(origin: string, key: string, value: string): void {
  const storageKey = buildStorageKey(origin, key);
  localStorage.setItem(storageKey, value);
}

export function deleteKV(origin: string, key: string): boolean {
  const storageKey = buildStorageKey(origin, key);
  const exists = localStorage.getItem(storageKey) !== null;
  localStorage.removeItem(storageKey);
  return exists;
}

export function listKVKeys(origin: string, prefix?: string): string[] {
  const originHash = hashOrigin(origin);
  const keyPrefix = `${KV_PREFIX}:${originHash}:`;
  const fullPrefix = prefix ? `${keyPrefix}${prefix}` : keyPrefix;
  const keys: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const storageKey = localStorage.key(i);
    if (storageKey?.startsWith(fullPrefix)) {
      // Extract the user key portion (after the origin hash prefix)
      const userKey = storageKey.slice(keyPrefix.length);
      keys.push(userKey);
    }
  }

  return keys.sort();
}

export function clearKVForOrigin(origin: string): number {
  const keys = listKVKeys(origin);
  for (const key of keys) {
    deleteKV(origin, key);
  }
  return keys.length;
}

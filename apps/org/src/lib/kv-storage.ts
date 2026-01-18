import { createGatewayClient, withAuth } from '../api/client';
import { getGatewayConfig } from '../utils/auth';
import { buildNamespace } from '@federise/proxy';

/**
 * Get the gateway client and auth config.
 * Throws if gateway is not configured.
 */
function getClient() {
  const { apiKey, url } = getGatewayConfig();
  if (!apiKey || !url) {
    throw new Error('Gateway not configured. API key and URL are required.');
  }
  return { client: createGatewayClient(url), apiKey };
}

/**
 * Get a value from KV storage for the given origin.
 */
export async function getKV(origin: string, key: string): Promise<string | null> {
  const { client, apiKey } = getClient();
  const namespace = buildNamespace(origin);

  const { data, error } = await client.POST('/kv/get', {
    ...withAuth(apiKey),
    body: { namespace, key },
  });

  if (error) {
    console.error('[KV] Failed to get:', error);
    throw new Error('Failed to get value from KV');
  }

  return data?.value ?? null;
}

/**
 * Set a value in KV storage for the given origin.
 */
export async function setKV(origin: string, key: string, value: string): Promise<void> {
  const { client, apiKey } = getClient();
  const namespace = buildNamespace(origin);

  const { error } = await client.POST('/kv/set', {
    ...withAuth(apiKey),
    body: { namespace, key, value },
  });

  if (error) {
    console.error('[KV] Failed to set:', error);
    throw new Error('Failed to set value in KV');
  }
}

/**
 * Delete a value from KV storage for the given origin.
 */
export async function deleteKV(origin: string, key: string): Promise<void> {
  const { client, apiKey } = getClient();
  const namespace = buildNamespace(origin);

  // Use set with empty value to "delete" (or implement a delete endpoint)
  // For now, we set to empty string - gateway should handle actual deletion
  const { error } = await client.POST('/kv/set', {
    ...withAuth(apiKey),
    body: { namespace, key, value: '' },
  });

  if (error) {
    console.error('[KV] Failed to delete:', error);
    throw new Error('Failed to delete value from KV');
  }
}

/**
 * List keys in KV storage for the given origin.
 */
export async function listKVKeys(origin: string, prefix?: string): Promise<string[]> {
  const { client, apiKey } = getClient();
  const namespace = buildNamespace(origin);

  const { data, error } = await client.POST('/kv/keys', {
    ...withAuth(apiKey),
    body: { namespace },
  });

  if (error) {
    console.error('[KV] Failed to list keys:', error);
    throw new Error('Failed to list keys from KV');
  }

  // API returns string[] directly
  const keys = data ?? [];

  // Filter by prefix if provided
  if (prefix) {
    return keys.filter(key => key.startsWith(prefix));
  }

  return keys;
}

/**
 * Clear all KV data for the given origin.
 */
export async function clearKVForOrigin(origin: string): Promise<number> {
  const keys = await listKVKeys(origin);

  for (const key of keys) {
    await deleteKV(origin, key);
  }

  return keys.length;
}

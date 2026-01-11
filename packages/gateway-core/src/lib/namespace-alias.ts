/**
 * Namespace Aliasing Utilities
 *
 * Provides short aliases for long namespace identifiers to make URLs prettier.
 * Maintains backward compatibility - both full namespaces and aliases work.
 *
 * Storage format:
 *   __NS_ALIAS:{alias} → {fullNamespace}     (resolve alias to full)
 *   __NS_FULL:{fullNamespace} → {alias}      (get alias from full)
 */

import type { IKVStore } from "../adapters/index.js";

const ALIAS_PREFIX = "__NS_ALIAS:";
const FULL_PREFIX = "__NS_FULL:";
const ALIAS_LENGTH = 8;

/**
 * Generate a deterministic short alias from a full namespace.
 * Uses the last 8 characters of base64url(sha256(namespace)).
 */
export async function generateAlias(namespace: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(namespace));
  const base64 = base64UrlEncode(new Uint8Array(hashBuffer));
  // Take last 8 characters for the alias
  return base64.slice(-ALIAS_LENGTH);
}

/**
 * Check if a string looks like a full namespace (vs an alias).
 * Full namespaces start with "origin_" and are 71+ chars.
 */
export function isFullNamespace(value: string): boolean {
  return value.startsWith("origin_") && value.length > 40;
}

/**
 * Resolve a namespace or alias to the full namespace.
 * Returns the full namespace if found, or null if alias doesn't exist.
 * If given a full namespace, returns it directly.
 */
export async function resolveNamespace(
  kv: IKVStore,
  namespaceOrAlias: string
): Promise<string | null> {
  // If it's already a full namespace, return it
  if (isFullNamespace(namespaceOrAlias)) {
    return namespaceOrAlias;
  }

  // Look up alias
  const fullNamespace = await kv.get(`${ALIAS_PREFIX}${namespaceOrAlias}`);
  return fullNamespace;
}

/**
 * Get the alias for a full namespace, or null if none exists.
 */
export async function getAlias(
  kv: IKVStore,
  fullNamespace: string
): Promise<string | null> {
  return kv.get(`${FULL_PREFIX}${fullNamespace}`);
}

/**
 * Get or create an alias for a namespace.
 * Returns the existing alias if one exists, otherwise creates and stores a new one.
 */
export async function getOrCreateAlias(
  kv: IKVStore,
  fullNamespace: string
): Promise<string> {
  // Check if alias already exists
  const existingAlias = await getAlias(kv, fullNamespace);
  if (existingAlias) {
    return existingAlias;
  }

  // Generate new alias
  const alias = await generateAlias(fullNamespace);

  // Check for collision (extremely unlikely with 8 chars of SHA-256)
  const collision = await kv.get(`${ALIAS_PREFIX}${alias}`);
  if (collision && collision !== fullNamespace) {
    // In the rare case of collision, append a suffix
    // This shouldn't happen in practice
    const extendedAlias = alias + Math.random().toString(36).slice(2, 4);
    await storeAliasMapping(kv, extendedAlias, fullNamespace);
    return extendedAlias;
  }

  // Store bidirectional mapping
  await storeAliasMapping(kv, alias, fullNamespace);
  return alias;
}

/**
 * Store the bidirectional alias mapping in KV.
 */
async function storeAliasMapping(
  kv: IKVStore,
  alias: string,
  fullNamespace: string
): Promise<void> {
  await Promise.all([
    kv.put(`${ALIAS_PREFIX}${alias}`, fullNamespace),
    kv.put(`${FULL_PREFIX}${fullNamespace}`, alias),
  ]);
}

/**
 * Encode bytes as base64url (URL-safe base64 without padding).
 */
function base64UrlEncode(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

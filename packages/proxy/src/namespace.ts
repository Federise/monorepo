/**
 * Namespace utilities for origin-based isolation.
 *
 * Each origin gets its own namespace to prevent cross-origin data access.
 * The namespace is derived from a SHA-256 hash of the origin.
 */

/**
 * Build a namespaced key for origin isolation.
 *
 * @param origin - The origin to create a namespace for (e.g., "http://localhost:5174")
 * @returns A namespace string like "origin_a1b2c3d4..."
 */
export async function buildNamespace(origin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(origin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `origin_${hashHex}`;
}

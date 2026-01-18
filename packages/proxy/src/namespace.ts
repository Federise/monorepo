/**
 * Namespace utilities for origin-based isolation.
 *
 * Each origin gets its own namespace to prevent cross-origin data access.
 * The namespace is a human-readable, URL-safe version of the origin.
 *
 * Example: https://www.example-app.com → www_example-app_com
 * Example: http://localhost:5174 → localhost_5174
 */

/**
 * Build a namespace from an origin URL.
 *
 * Transforms the origin to be human-readable and URL-safe:
 * - Removes protocol (http://, https://)
 * - Keeps port numbers (mapped via colon → underscore)
 * - Removes trailing slashes
 * - Replaces dots and colons with underscores
 * - Removes any other unsafe characters
 *
 * @param origin - The origin to create a namespace for (e.g., "https://www.example-app.com")
 * @returns A namespace string like "www_example-app_com" or "localhost_5174"
 */
export function buildNamespace(origin: string): string {
  let namespace = origin;

  // Remove protocol
  namespace = namespace.replace(/^https?:\/\//, "");

  // Remove trailing slash
  namespace = namespace.replace(/\/$/, "");

  // Replace dots and colons with underscores (keeps port as part of namespace)
  namespace = namespace.replace(/[.:]/g, "_");

  // Remove any characters that aren't alphanumeric, underscore, or hyphen
  namespace = namespace.replace(/[^a-zA-Z0-9_-]/g, "");

  return namespace;
}

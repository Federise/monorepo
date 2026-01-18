/**
 * Namespace utility for displaying the current app's identity.
 *
 * The namespace is derived from the current page's origin and represents
 * the app's identity in the Federise system. All data (KV, blobs, channels)
 * is isolated to this namespace.
 */

/**
 * Get the namespace for the current origin.
 * This matches the server-side buildNamespace function.
 *
 * Example: http://localhost:5174 → localhost_5174
 * Example: https://www.example-app.com → www_example-app_com
 */
export function getNamespace(): string {
  const origin = window.location.origin;

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

/**
 * Get a shortened display name for the namespace.
 * For local development, returns "localhost:port".
 * For production, returns a shortened version of the domain.
 */
export function getNamespaceDisplayName(): string {
  const namespace = getNamespace();

  // For localhost with port, show it nicely (localhost_5174 → localhost:5174)
  if (namespace.startsWith('localhost_')) {
    return namespace.replace('_', ':');
  }

  // For other domains, return as-is but truncate if too long
  if (namespace.length > 20) {
    return namespace.slice(0, 17) + '...';
  }

  return namespace;
}

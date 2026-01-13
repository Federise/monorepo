/**
 * Authentication utilities for Federise Gateway
 *
 * Storage Strategy:
 * - Top-level context: Use localStorage (simple, fast)
 * - Iframe context: Use cookies via Storage Access API (widely supported)
 *
 * The Storage Access API grants access to third-party cookies. The newer
 * localStorage handle feature is not widely supported, so we use cookies
 * as the primary cross-origin storage mechanism.
 *
 * When saving config (top-level), we write to BOTH localStorage and cookies
 * so the iframe can read from cookies after requesting storage access.
 */

const STORAGE_KEY_API = 'federise:gateway:apiKey';
const STORAGE_KEY_URL = 'federise:gateway:url';

const COOKIE_KEY_API = 'federise_gateway_apiKey';
const COOKIE_KEY_URL = 'federise_gateway_url';

// Track whether we have storage access in iframe context
let hasStorageAccess = false;

// Store the unpartitioned localStorage handle if available (newer API)
let unpartitionedStorage: Storage | null = null;

// ============================================================================
// Cookie Helpers
// ============================================================================

/**
 * Set a cookie with cross-origin iframe support.
 *
 * For HTTPS (production): Uses SameSite=None + Secure for cross-origin iframe access.
 * For HTTP (localhost dev): Uses SameSite=Lax without Secure.
 *   - Secure flag requires HTTPS, so it can't be used on localhost
 *   - SameSite=None requires Secure, so we fall back to Lax
 *   - Different localhost ports are considered same-site, so Lax works for local dev
 */
function setCookie(name: string, value: string, days: number = 365): void {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  const isSecure = window.location.protocol === 'https:';

  if (isSecure) {
    // Production: SameSite=None + Secure for cross-origin iframe access
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=None; Secure`;
  } else {
    // Local dev: SameSite=Lax works because localhost ports are same-site
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
  }
}

/**
 * Get a cookie value by name
 */
function getCookie(name: string): string | null {
  const cookies = document.cookie.split('; ');
  for (const cookie of cookies) {
    const [cookieName, ...cookieValueParts] = cookie.split('=');
    if (cookieName === name) {
      return decodeURIComponent(cookieValueParts.join('='));
    }
  }
  return null;
}

/**
 * Delete a cookie
 */
function deleteCookie(name: string): void {
  const isSecure = window.location.protocol === 'https:';

  if (isSecure) {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=None; Secure`;
  } else {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
  }
}

// ============================================================================
// Storage Access
// ============================================================================

/**
 * Check if we're running in an iframe
 */
function isIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    // If we can't access window.top due to cross-origin restrictions, we're in an iframe
    return true;
  }
}

/**
 * Check if we already have storage access (without requesting it).
 * Updates internal state if access is already granted.
 * Returns true if we have access, false otherwise.
 */
export async function checkStorageAccess(): Promise<boolean> {
  if (!isIframe()) {
    hasStorageAccess = true;
    return true;
  }

  if (!document.hasStorageAccess) {
    // API not available - assume we have access
    hasStorageAccess = true;
    return true;
  }

  try {
    const hasAccess = await document.hasStorageAccess();
    if (hasAccess) {
      hasStorageAccess = true;
    }
    return hasAccess;
  } catch {
    return false;
  }
}

/**
 * Request unpartitioned storage access (for iframe contexts).
 * This grants access to third-party cookies (widely supported).
 * Also attempts to get localStorage handle (newer, less supported).
 *
 * Must be called from a user gesture (click/tap).
 */
export async function requestStorageAccess(): Promise<boolean> {
  if (!isIframe()) {
    hasStorageAccess = true;
    return true;
  }

  // Check if Storage Access API is available
  if (!document.requestStorageAccess) {
    console.warn('[Auth] Storage Access API not available');
    hasStorageAccess = true;
    return true;
  }

  try {
    // Try the newer API with localStorage handle first
    try {
      const handle = await document.requestStorageAccess({ localStorage: true });
      if (handle && typeof handle === 'object' && 'localStorage' in handle) {
        unpartitionedStorage = (handle as StorageAccessHandle).localStorage ?? null;
      }
    } catch {
      // localStorage option not supported, fall back to basic cookie access
      await document.requestStorageAccess();
    }

    hasStorageAccess = true;
    return true;
  } catch (err) {
    console.warn('[Auth] Storage access request failed:', err);
    return false;
  }
}

// ============================================================================
// Gateway Config - Read
// ============================================================================

/**
 * Get the gateway API key
 * - If we have unpartitioned localStorage handle: try it first
 * - In iframe: try cookies (works on localhost same-site and with Storage Access)
 * - In top-level: use localStorage
 */
export function getGatewayApiKey(): string | null {
  // If we have the unpartitioned localStorage handle, try it first
  if (unpartitionedStorage) {
    const value = unpartitionedStorage.getItem(STORAGE_KEY_API);
    if (value) {
      return value;
    }
    // Fall through to try cookies if unpartitioned storage doesn't have the value
  }

  // In iframe context, try cookies
  // On localhost (same-site), cookies are accessible without Storage Access API
  // On production with Storage Access granted, cookies are also accessible
  if (isIframe()) {
    const cookieValue = getCookie(COOKIE_KEY_API);
    if (cookieValue) {
      return cookieValue;
    }
    // Fall through to try localStorage (for backward compat or if cookies not set)
  }

  // Top-level context or iframe fallback: try localStorage
  return localStorage.getItem(STORAGE_KEY_API);
}

/**
 * Get the gateway URL
 */
export function getGatewayUrl(): string | null {
  // If we have the unpartitioned localStorage handle, try it first
  if (unpartitionedStorage) {
    const value = unpartitionedStorage.getItem(STORAGE_KEY_URL);
    if (value) {
      return value;
    }
    // Fall through to try cookies if unpartitioned storage doesn't have the value
  }

  // In iframe context, try cookies (same logic as getGatewayApiKey)
  if (isIframe()) {
    const cookieValue = getCookie(COOKIE_KEY_URL);
    if (cookieValue) {
      return cookieValue;
    }
  }

  return localStorage.getItem(STORAGE_KEY_URL);
}

/**
 * Get the gateway configuration (API key and URL)
 */
export function getGatewayConfig(): { apiKey: string | null; url: string | null } {
  return {
    apiKey: getGatewayApiKey(),
    url: getGatewayUrl(),
  };
}

/**
 * Check if the gateway is configured
 */
export function isGatewayConfigured(): boolean {
  const { apiKey, url } = getGatewayConfig();
  return Boolean(apiKey && url);
}

/**
 * Get the authorization headers for API requests
 */
export function getGatewayAuth(apiKey?: string): { headers: { authorization: string } } {
  const key = apiKey || getGatewayApiKey();
  if (!key) {
    throw new Error('No API key available');
  }
  return {
    headers: {
      authorization: `ApiKey ${key}`,
    },
  };
}

// ============================================================================
// Gateway Config - Write (top-level only)
// ============================================================================

/**
 * Save the gateway configuration.
 * Writes to BOTH localStorage and cookies so the iframe can access via cookies.
 */
export function saveGatewayConfig(apiKey: string, url: string): void {
  localStorage.setItem(STORAGE_KEY_API, apiKey);
  localStorage.setItem(STORAGE_KEY_URL, url);
  setCookie(COOKIE_KEY_API, apiKey);
  setCookie(COOKIE_KEY_URL, url);
}

/**
 * Clear the gateway configuration from all storage
 */
export function clearGatewayConfig(): void {
  localStorage.removeItem(STORAGE_KEY_API);
  localStorage.removeItem(STORAGE_KEY_URL);
  deleteCookie(COOKIE_KEY_API);
  deleteCookie(COOKIE_KEY_URL);
}

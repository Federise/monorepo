/**
 * Authentication utilities for Federise Gateway
 */

const STORAGE_KEY_API = 'federise:gateway:apiKey';
const STORAGE_KEY_URL = 'federise:gateway:url';

/**
 * Get the gateway API key from localStorage
 */
export function getGatewayApiKey(): string | null {
  return localStorage.getItem(STORAGE_KEY_API);
}

/**
 * Get the gateway URL from localStorage
 */
export function getGatewayUrl(): string | null {
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
 * @param apiKey Optional API key (defaults to stored key)
 * @returns Authorization headers object
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

/**
 * Save the gateway configuration to localStorage
 */
export function saveGatewayConfig(apiKey: string, url: string): void {
  localStorage.setItem(STORAGE_KEY_API, apiKey);
  localStorage.setItem(STORAGE_KEY_URL, url);
}

/**
 * Clear the gateway configuration from localStorage
 */
export function clearGatewayConfig(): void {
  localStorage.removeItem(STORAGE_KEY_API);
  localStorage.removeItem(STORAGE_KEY_URL);
}

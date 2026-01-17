import { FederiseClient, type Capability } from '@federise/sdk';
import type { ConnectionState } from '../lib/types';

const FRAME_URL_KEY = 'federise-demo:frameUrl';
const DEFAULT_FRAME_URL = 'http://localhost:4321/frame';

// Reactive state using Svelte 5 runes
export const connectionState = $state<{ value: ConnectionState }>({ value: 'disconnected' });
export const capabilities = $state<{ value: Capability[] }>({ value: [] });
export const frameUrl = $state<{ value: string }>({
  value: localStorage.getItem(FRAME_URL_KEY) || DEFAULT_FRAME_URL,
});
export const error = $state<{ value: string | null }>({ value: null });
export const initialized = $state<{ value: boolean }>({ value: false });

let client: FederiseClient | null = null;
let initializationPromise: Promise<void> | null = null;

export function getClient(): FederiseClient | null {
  return client;
}

export function setFrameUrl(url: string): void {
  frameUrl.value = url;
  localStorage.setItem(FRAME_URL_KEY, url);
}

export async function connect(): Promise<void> {
  if (connectionState.value !== 'disconnected') return;

  connectionState.value = 'connecting';
  error.value = null;

  try {
    client = new FederiseClient({
      frameUrl: frameUrl.value,
      timeout: 30000,
    });

    await client.connect();
    capabilities.value = client.getGrantedCapabilities();
    connectionState.value = 'connected';
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to connect';
    connectionState.value = 'disconnected';
    client = null;
    throw err;
  }
}

export function disconnect(): void {
  if (client) {
    client.disconnect();
    client = null;
  }
  connectionState.value = 'disconnected';
  capabilities.value = [];
  error.value = null;
}

export async function requestPermissions(): Promise<void> {
  if (!client || connectionState.value !== 'connected') {
    throw new Error('Not connected');
  }

  try {
    await client.requestCapabilities(['kv:read', 'kv:write', 'kv:delete', 'blob:read', 'blob:write', 'channel:create', 'channel:delete']);
    capabilities.value = client.getGrantedCapabilities();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to request permissions';
    throw err;
  }
}

export function hasCapability(cap: Capability): boolean {
  return capabilities.value.includes(cap);
}

export function hasKVPermissions(): boolean {
  return hasCapability('kv:read') && hasCapability('kv:write');
}

export function hasBlobPermissions(): boolean {
  return hasCapability('blob:read') && hasCapability('blob:write');
}

export function hasChannelPermissions(): boolean {
  return hasCapability('channel:create');
}

export function hasChannelDeletePermissions(): boolean {
  return hasCapability('channel:delete');
}

/**
 * Initialize connection on page load.
 * Attempts to reconnect using the saved frame URL.
 * If already connected or currently initializing, returns immediately.
 */
export async function initializeConnection(): Promise<void> {
  // Return existing promise if initialization is in progress
  if (initializationPromise) {
    return initializationPromise;
  }

  // Already initialized
  if (initialized.value) {
    return;
  }

  initializationPromise = doInitialize();
  return initializationPromise;
}

async function doInitialize(): Promise<void> {
  try {
    // Only auto-connect if we have a saved frame URL
    const savedUrl = localStorage.getItem(FRAME_URL_KEY);
    if (!savedUrl) {
      return;
    }

    // Try to connect - this will restore capabilities from KV via the frame
    await connect();
  } catch {
    // Auto-connect failed silently - user can manually connect
    // This is expected if storage access hasn't been granted yet
  } finally {
    initialized.value = true;
    initializationPromise = null;
  }
}

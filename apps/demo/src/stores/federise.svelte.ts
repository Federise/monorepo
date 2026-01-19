import { FederiseClient, type Capability, type IdentityInfo, type VaultSummary } from '@federise/sdk';
import type { ConnectionState } from '../lib/types';

const FRAME_URL_KEY = 'federise-demo:frameUrl';
const FRAME_VERIFIED_KEY = 'federise-demo:frameVerified';
const DEFAULT_FRAME_URL = 'http://localhost:4321/frame';

// Reactive state using Svelte 5 runes
export const connectionState = $state<{ value: ConnectionState }>({ value: 'disconnected' });
export const capabilities = $state<{ value: Capability[] }>({ value: [] });
export const frameUrl = $state<{ value: string }>({
  value: localStorage.getItem(FRAME_URL_KEY) || DEFAULT_FRAME_URL,
});
export const error = $state<{ value: string | null }>({ value: null });
export const initialized = $state<{ value: boolean }>({ value: false });
export const connectionFailed = $state<{ value: boolean }>({ value: false });
export const frameVerified = $state<{ value: boolean }>({
  value: localStorage.getItem(FRAME_VERIFIED_KEY) === 'true',
});

// Identity-related state
export const activeIdentity = $state<{ value: IdentityInfo | null }>({ value: null });
export const vaultSummary = $state<{ value: VaultSummary | null }>({ value: null });

let client: FederiseClient | null = null;
let initializationPromise: Promise<void> | null = null;

export function getClient(): FederiseClient | null {
  return client;
}

export function setFrameUrl(url: string): void {
  frameUrl.value = url;
  localStorage.setItem(FRAME_URL_KEY, url);
  // Reset verified state when URL changes
  frameVerified.value = false;
  localStorage.removeItem(FRAME_VERIFIED_KEY);
}

function markFrameVerified(): void {
  frameVerified.value = true;
  localStorage.setItem(FRAME_VERIFIED_KEY, 'true');
}

export async function connect(): Promise<void> {
  if (connectionState.value !== 'disconnected') return;

  connectionState.value = 'connecting';
  error.value = null;
  connectionFailed.value = false;

  try {
    client = new FederiseClient({
      frameUrl: frameUrl.value,
      timeout: 30000,
    });

    await client.connect();
    capabilities.value = client.getGrantedCapabilities();
    connectionState.value = 'connected';
    markFrameVerified();

    // Load identity info in the background
    loadActiveIdentity().catch(() => {});
    loadVaultSummary().catch(() => {});
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to connect';
    connectionState.value = 'disconnected';
    connectionFailed.value = true;
    client = null;
    throw err;
  }
}

/**
 * Test connection to the frame URL without persisting.
 * Used by Settings page to verify URL before saving.
 */
export async function testConnection(): Promise<boolean> {
  const testClient = new FederiseClient({
    frameUrl: frameUrl.value,
    timeout: 10000,
  });

  try {
    await testClient.connect();
    testClient.disconnect();
    markFrameVerified();
    return true;
  } catch {
    return false;
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
  activeIdentity.value = null;
  vaultSummary.value = null;
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

// Identity-related functions

/**
 * Load the active identity from the vault.
 */
export async function loadActiveIdentity(): Promise<void> {
  if (!client || connectionState.value !== 'connected') {
    return;
  }

  try {
    const identity = await client.identity.getActive();
    activeIdentity.value = identity;
  } catch (err) {
    console.error('Failed to load active identity:', err);
    activeIdentity.value = null;
  }
}

/**
 * Load the vault summary.
 */
export async function loadVaultSummary(): Promise<void> {
  if (!client || connectionState.value !== 'connected') {
    return;
  }

  try {
    const summary = await client.identity.getVaultSummary();
    vaultSummary.value = summary;
  } catch (err) {
    console.error('Failed to load vault summary:', err);
    vaultSummary.value = null;
  }
}

/**
 * Get identities that have a specific capability.
 */
export async function getIdentitiesForCapability(
  capability: string,
  resourceType?: string,
  resourceId?: string,
  gatewayUrl?: string
): Promise<IdentityInfo[]> {
  if (!client || connectionState.value !== 'connected') {
    return [];
  }

  try {
    return await client.identity.getForCapability(capability, resourceType, resourceId, gatewayUrl);
  } catch (err) {
    console.error('Failed to get identities for capability:', err);
    return [];
  }
}

/**
 * Select an identity to use for subsequent operations.
 */
export async function selectIdentity(identityId: string): Promise<IdentityInfo | null> {
  if (!client || connectionState.value !== 'connected') {
    return null;
  }

  try {
    const identity = await client.identity.select(identityId);
    activeIdentity.value = identity;
    return identity;
  } catch (err) {
    console.error('Failed to select identity:', err);
    return null;
  }
}

/**
 * Ensure an identity is selected, auto-selecting the primary if none selected.
 * Returns the active identity or null if no identities available.
 */
export async function ensureIdentitySelected(): Promise<IdentityInfo | null> {
  // Already have an active identity
  if (activeIdentity.value) {
    return activeIdentity.value;
  }

  // Try to get available identities and select the primary one
  const identities = await getIdentitiesForCapability('channel:read');
  if (identities.length === 0) {
    return null;
  }

  // Find primary identity or use first one
  const primary = identities.find(i => i.isPrimary) ?? identities[0];
  return selectIdentity(primary.identityId);
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
    // Only auto-connect if the frame URL has been verified
    if (!frameVerified.value) {
      connectionFailed.value = true;
      return;
    }

    // Try to connect - this will restore capabilities from KV via the frame
    await connect();
  } catch {
    // Auto-connect failed - mark as failed so we redirect to settings
    connectionFailed.value = true;
  } finally {
    initialized.value = true;
    initializationPromise = null;
  }
}

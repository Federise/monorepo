<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    MessageRouter,
    PostMessageTransport,
    RemoteBackend,
    CookieCapabilityStore,
    createVaultStorage,
    createVaultQueries,
  } from '@federise/proxy';
  import type { VaultStorage, VaultQueries, VaultEntry } from '@federise/proxy';
  import { checkStorageAccess, requestStorageAccess } from '../utils/auth';

  // Transport reference for cleanup
  let transport: PostMessageTransport | null = null;

  // Vault storage for multi-identity support
  let vault: VaultStorage | null = null;
  let vaultQueries: VaultQueries | null = null;

  // UI state for storage access flow
  let needsStorageAccess = $state(false);
  let needsSetup = $state(false);
  let storageAccessError = $state<string | null>(null);
  let isRequestingAccess = $state(false);

  /**
   * Get the primary identity from vault, or the first owner identity.
   */
  function getPrimaryIdentity(): VaultEntry | null {
    if (!vault) return null;

    const entries = vault.getAll();
    if (entries.length === 0) return null;

    // Find primary identity
    const primary = entries.find(e => e.isPrimary);
    if (primary) return primary;

    // Fall back to first owner identity
    const owner = entries.find(e => e.source === 'owner');
    if (owner) return owner;

    // Fall back to first identity
    return entries[0];
  }

  /**
   * Check if vault has any identities
   */
  function hasIdentities(): boolean {
    if (!vault) return false;
    return vault.getAll().length > 0;
  }

  async function handleConnectClick(): Promise<void> {
    isRequestingAccess = true;
    storageAccessError = null;

    try {
      const success = await requestStorageAccess();

      if (!success) {
        storageAccessError = 'Storage access was denied. Please try again.';
        return;
      }

      // Re-initialize vault after storage access
      vault = createVaultStorage(localStorage);
      vaultQueries = createVaultQueries(vault);

      if (!hasIdentities()) {
        needsSetup = true;
        needsStorageAccess = false;
        return;
      }

      // Success - initialize the proxy and hide UI
      needsStorageAccess = false;
      initializeProxy();

      // Signal to parent that storage access was granted
      if (window.parent !== window) {
        window.parent.postMessage({ type: '__STORAGE_ACCESS_GRANTED__' }, '*');
      }
    } catch (err) {
      storageAccessError = err instanceof Error ? err.message : 'Failed to request storage access';
    } finally {
      isRequestingAccess = false;
    }
  }

  function initializeProxy(): void {
    if (transport) return; // Already initialized

    // Initialize vault storage
    vault = createVaultStorage(localStorage);
    vaultQueries = createVaultQueries(vault);

    // Get primary identity for credentials
    const identity = getPrimaryIdentity();
    if (!identity) {
      console.error('[FrameEnforcer] No identity in vault');
      needsSetup = true;
      return;
    }

    // Create the backend with identity's credentials
    const backend = new RemoteBackend({
      gatewayUrl: identity.gatewayUrl,
      apiKey: identity.apiKey,
    });

    // Create the capability store
    const capabilities = new CookieCapabilityStore({ backend });

    // Create the message router
    const router = new MessageRouter({
      backend,
      capabilities,
      vault,
      vaultQueries,
      onAuthRequired: async (origin, requestedCapabilities, alreadyGranted) => {
        // Build the scope from capabilities that aren't already granted
        const needsApproval = requestedCapabilities.filter((c) => !alreadyGranted.includes(c));
        const scope = needsApproval.join(',');
        const authUrl = `/authorize#app_origin=${encodeURIComponent(origin)}&scope=${encodeURIComponent(scope)}`;
        return new URL(authUrl, window.location.origin).href;
      },
      onTokenActionRequired: async (tokenId, action) => {
        // Build URL for token action (identity claim, etc.)
        const actionUrl = `/claim?token=${encodeURIComponent(tokenId)}&action=${encodeURIComponent(action)}`;
        return new URL(actionUrl, window.location.origin).href;
      },
      getGatewayUrl: () => identity.gatewayUrl,
      // Enable test messages only in development
      enableTestMessages: import.meta.env.DEV,
      testMessageOrigins: ['http://localhost:5174'],
    });

    // Create the transport
    transport = new PostMessageTransport({
      router,
      onStorageAccessRequired: () => {
        needsStorageAccess = true;
        if (window.parent !== window) {
          window.parent.postMessage({ type: '__STORAGE_ACCESS_REQUIRED__' }, '*');
        }
      },
      onReady: () => {
        console.log('[FrameEnforcer] Proxy ready');
      },
    });

    // Signal ready
    transport.signalReady();
  }

  onMount(async () => {
    const isIframe = window.self !== window.top;

    // Initialize vault
    vault = createVaultStorage(localStorage);
    vaultQueries = createVaultQueries(vault);

    if (!isIframe) {
      // Top-level context - just initialize directly if we have identities
      if (hasIdentities()) {
        initializeProxy();
      } else {
        needsSetup = true;
      }
      return;
    }

    // In iframe context, check storage access
    await checkStorageAccess();

    // Check if we have identities in vault
    if (hasIdentities()) {
      initializeProxy();
      return;
    }

    // No identities - show modal
    needsStorageAccess = true;
    if (window.parent !== window) {
      window.parent.postMessage({ type: '__STORAGE_ACCESS_REQUIRED__' }, '*');
    }
  });

  onDestroy(() => {
    transport?.destroy();
    transport = null;
  });
</script>

{#if needsSetup}
  <div class="connect-container">
    <div class="connect-card">
      <svg class="logo" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="14" stroke="currentColor" stroke-width="2"/>
        <path d="M10 16h12M16 10v12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <h2>Set Up Federise</h2>
      <p>No identities found. Please set up your Federise account first.</p>

      <a href="/" class="connect-button">Go to Setup</a>

      <p class="hint">
        Need help? <a href="https://federise.org/docs" target="_blank">Read the docs</a>
      </p>
    </div>
  </div>
{:else if needsStorageAccess}
  <div class="connect-container">
    <div class="connect-card">
      <svg class="logo" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="14" stroke="currentColor" stroke-width="2"/>
        <path d="M10 16h12M16 10v12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <h2>Connect with Federise</h2>
      <p>This app uses Federise for secure data storage. Click below to connect your Federise account.</p>

      {#if storageAccessError}
        <div class="error">{storageAccessError}</div>
      {/if}

      <button
        class="connect-button"
        onclick={handleConnectClick}
        disabled={isRequestingAccess}
      >
        {#if isRequestingAccess}
          Connecting...
        {:else}
          Connect with Federise
        {/if}
      </button>

      <p class="hint">
        Don't have an account? <a href="https://federise.org" target="_blank">Set up Federise</a>
      </p>
    </div>
  </div>
{/if}

<style>
  .connect-container {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 1rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .connect-card {
    background: white;
    border-radius: 16px;
    padding: 2rem;
    max-width: 360px;
    text-align: center;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  }

  .logo {
    width: 48px;
    height: 48px;
    color: #667eea;
    margin-bottom: 1rem;
  }

  h2 {
    margin: 0 0 0.5rem;
    font-size: 1.5rem;
    color: #1a1a2e;
  }

  p {
    margin: 0 0 1.5rem;
    color: #666;
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .error {
    background: #fee2e2;
    border: 1px solid #fecaca;
    color: #dc2626;
    padding: 0.75rem;
    border-radius: 8px;
    margin-bottom: 1rem;
    font-size: 0.85rem;
  }

  .connect-button {
    display: block;
    width: 100%;
    padding: 0.875rem 1.5rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    text-decoration: none;
    text-align: center;
  }

  .connect-button:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  .connect-button:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .hint {
    margin-top: 1.5rem;
    margin-bottom: 0;
    font-size: 0.8rem;
    color: #888;
  }

  .hint a {
    color: #667eea;
    text-decoration: none;
  }

  .hint a:hover {
    text-decoration: underline;
  }

  @media (max-width: 480px) {
    .connect-container {
      padding: 0.75rem;
      align-items: flex-start;
      padding-top: 10vh;
    }

    .connect-card {
      padding: 1.5rem;
      border-radius: 12px;
      max-width: 100%;
    }

    .logo {
      width: 40px;
      height: 40px;
    }

    h2 {
      font-size: 1.25rem;
    }

    p {
      font-size: 0.85rem;
      margin-bottom: 1.25rem;
    }

    .connect-button {
      padding: 0.75rem 1.25rem;
      font-size: 0.95rem;
    }

    .hint {
      margin-top: 1.25rem;
      font-size: 0.75rem;
    }
  }
</style>

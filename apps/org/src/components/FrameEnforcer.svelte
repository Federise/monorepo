<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    MessageRouter,
    PostMessageTransport,
    RemoteBackend,
    CookieCapabilityStore,
  } from '@federise/proxy';
  import { checkStorageAccess, requestStorageAccess, isGatewayConfigured, getGatewayConfig } from '../utils/auth';

  // Transport reference for cleanup
  let transport: PostMessageTransport | null = null;

  // UI state for storage access flow
  let needsStorageAccess = $state(false);
  let storageAccessError = $state<string | null>(null);
  let isRequestingAccess = $state(false);

  async function handleConnectClick(): Promise<void> {
    isRequestingAccess = true;
    storageAccessError = null;

    try {
      const success = await requestStorageAccess();

      if (!success) {
        storageAccessError = 'Storage access was denied. Please try again.';
        return;
      }

      if (!isGatewayConfigured()) {
        storageAccessError = 'Storage access granted, but Federise is not configured. Please visit federise.org to set up your account first.';
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

    const { apiKey, url } = getGatewayConfig();
    if (!apiKey || !url) {
      console.error('[FrameEnforcer] Gateway not configured');
      return;
    }

    // Create the backend
    const backend = new RemoteBackend({
      gatewayUrl: url,
      apiKey: apiKey,
    });

    // Create the capability store
    const capabilities = new CookieCapabilityStore({ backend });

    // Create the message router
    const router = new MessageRouter({
      backend,
      capabilities,
      onAuthRequired: async (origin, requestedCapabilities, alreadyGranted) => {
        // Build the scope from capabilities that aren't already granted
        const needsApproval = requestedCapabilities.filter((c) => !alreadyGranted.includes(c));
        const scope = needsApproval.join(',');
        const authUrl = `/authorize?app_origin=${encodeURIComponent(origin)}&scope=${encodeURIComponent(scope)}`;
        return new URL(authUrl, window.location.origin).href;
      },
      getGatewayUrl: () => url,
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

    if (!isIframe) {
      // Top-level context - just initialize directly
      if (isGatewayConfigured()) {
        initializeProxy();
      }
      return;
    }

    // In iframe context, check storage access
    await checkStorageAccess();

    // Check if gateway is configured
    if (isGatewayConfigured()) {
      // Gateway is configured - initialize the proxy
      initializeProxy();
      return;
    }

    // Gateway not configured - show modal
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

{#if needsStorageAccess}
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

  /* Mobile styles */
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

<script lang="ts">
  import Sidebar from './components/Sidebar.svelte';
  import Settings from './components/Settings.svelte';
  import Notes from './components/demos/Notes.svelte';
  import Files from './components/demos/Files.svelte';
  import Chat from './components/demos/Chat.svelte';
  import ChannelView from './components/demos/ChannelView.svelte';
  import { connectionState, hasKVPermissions, hasBlobPermissions, hasLogPermissions, initialized, initializeConnection } from './stores/federise.svelte';
  import { onMount, onDestroy } from 'svelte';

  type View = 'notes' | 'files' | 'chat' | 'channel' | 'settings';

  // Channel view state (from URL path)
  let channelToken = $state<string | null>(null);
  let channelGatewayUrl = $state<string | null>(null);

  function getViewFromPath(): { view: View; token: string | null; gatewayUrl: string | null } {
    const path = window.location.pathname;
    const hash = window.location.hash.slice(1);

    // Check for /channel#token@gatewayUrl pattern
    if (path === '/channel' && hash) {
      // Parse token and gateway URL from hash
      // Format: <token>@<base64urlGatewayUrl>
      const atIndex = hash.lastIndexOf('@');
      if (atIndex !== -1) {
        const token = hash.slice(0, atIndex);
        const base64Gateway = hash.slice(atIndex + 1);
        // Decode base64url: restore standard base64 chars and add padding
        const base64 = base64Gateway
          .replace(/-/g, '+')
          .replace(/_/g, '/')
          .padEnd(base64Gateway.length + (4 - base64Gateway.length % 4) % 4, '=');
        const gatewayUrl = atob(base64);
        return { view: 'channel', token, gatewayUrl };
      }
      // Fallback: no gateway URL in hash (legacy format)
      return { view: 'channel', token: hash, gatewayUrl: null };
    }

    // Fall back to hash-based routing
    if (hash === 'settings') return { view: 'settings', token: null, gatewayUrl: null };
    if (hash === 'files') return { view: 'files', token: null, gatewayUrl: null };
    if (hash === 'chat') return { view: 'chat', token: null, gatewayUrl: null };
    return { view: 'notes', token: null, gatewayUrl: null };
  }

  function getViewFromHash(): View {
    const { view, token, gatewayUrl } = getViewFromPath();
    channelToken = token;
    channelGatewayUrl = gatewayUrl;
    return view;
  }

  let currentView = $state<View>(getViewFromHash());
  let mobileMenuOpen = $state(false);

  function handleHashChange() {
    currentView = getViewFromHash();
  }

  $effect(() => {
    // Don't update hash for channel view (it uses path-based routing)
    if (currentView !== 'channel') {
      window.location.hash = currentView;
    }
  });

  onMount(() => {
    initializeConnection();
    window.addEventListener('hashchange', handleHashChange);
  });

  onDestroy(() => {
    window.removeEventListener('hashchange', handleHashChange);
  });
</script>

{#if currentView === 'channel' && channelToken}
  <ChannelView token={channelToken} gatewayUrl={channelGatewayUrl} />
{:else}
  <div class="app-layout">
    <Sidebar bind:currentView bind:mobileMenuOpen />

    <div class="main-wrapper">
      <!-- Mobile header -->
      <header class="mobile-header">
        <button class="menu-btn" onclick={() => (mobileMenuOpen = true)} aria-label="Open menu">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <span class="mobile-title">Federise Demo</span>
        <span
          class="status-dot mobile-status"
          class:connected={connectionState.value === 'connected'}
          class:connecting={connectionState.value === 'connecting'}
          class:disconnected={connectionState.value === 'disconnected'}
        ></span>
      </header>

      <main class="main-content">
        {#if !initialized.value}
          <div class="card connect-prompt">
            <div class="spinner"></div>
            <p>Restoring connection...</p>
          </div>
        {:else if currentView === 'settings'}
          <Settings />
        {:else if currentView === 'notes'}
          {#if connectionState.value === 'connected' && hasKVPermissions()}
            <Notes />
          {:else}
            <div class="card connect-prompt">
              <div class="prompt-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </div>
              <h2>Notes Demo</h2>
              <p>Connect to Federise and grant KV permissions to use the notes demo.</p>
              {#if connectionState.value === 'disconnected'}
                <p class="hint">Click "Connect" in the sidebar to get started.</p>
              {:else if connectionState.value === 'connected'}
                <p class="hint">Click "Grant Permissions" to enable KV access.</p>
              {/if}
            </div>
          {/if}
        {:else if currentView === 'files'}
          {#if connectionState.value === 'connected' && hasBlobPermissions()}
            <Files />
          {:else}
            <div class="card connect-prompt">
              <div class="prompt-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <h2>Files Demo</h2>
              <p>Connect to Federise and grant blob permissions to use the files demo.</p>
              {#if connectionState.value === 'disconnected'}
                <p class="hint">Click "Connect" in the sidebar to get started.</p>
              {:else if connectionState.value === 'connected'}
                <p class="hint">Click "Grant Permissions" to enable file access.</p>
              {/if}
            </div>
          {/if}
        {:else if currentView === 'chat'}
          {#if connectionState.value === 'connected' && hasLogPermissions()}
            <Chat />
          {:else}
            <div class="card connect-prompt">
              <div class="prompt-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <h2>Chat Demo</h2>
              <p>Connect to Federise and grant log permissions to create and share channels.</p>
              {#if connectionState.value === 'disconnected'}
                <p class="hint">Click "Connect" in the sidebar to get started.</p>
              {:else if connectionState.value === 'connected'}
                <p class="hint">Click "Grant Permissions" to enable chat.</p>
              {/if}
            </div>
          {/if}
        {/if}
      </main>
    </div>
  </div>
{/if}

<style>
  .app-layout {
    display: flex;
    height: 100vh;
    overflow: hidden;
  }

  .main-wrapper {
    flex: 1;
    margin-left: 240px;
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  .mobile-header {
    display: none;
  }

  .main-content {
    flex: 1;
    padding: 2rem;
    max-width: 1000px;
    overflow: auto;
  }

  .connect-prompt {
    text-align: center;
    max-width: 400px;
    margin: 4rem auto;
    padding: 3rem 2rem;
  }

  .prompt-icon {
    color: var(--color-text-muted);
    margin-bottom: 1.5rem;
  }

  .connect-prompt h2 {
    margin-bottom: 0.75rem;
    font-size: 1.25rem;
  }

  .connect-prompt p {
    color: var(--color-text-muted);
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
  }

  .connect-prompt .hint {
    font-size: 0.8rem;
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--color-border);
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    margin: 0 auto 1rem;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Mobile styles */
  @media (max-width: 768px) {
    .main-wrapper {
      margin-left: 0;
    }

    .mobile-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.75rem 1rem;
      background: var(--color-surface);
      border-bottom: 1px solid var(--color-border);
      position: sticky;
      top: 0;
      z-index: 50;
    }

    .menu-btn {
      padding: 0.5rem;
      background: transparent;
      border: none;
      color: var(--color-text);
      border-radius: var(--radius);
    }

    .menu-btn:hover {
      background: var(--color-surface-hover);
    }

    .mobile-title {
      flex: 1;
      font-weight: 600;
    }

    .mobile-status {
      width: 10px;
      height: 10px;
    }

    .main-content {
      padding: 1rem;
    }

    .connect-prompt {
      margin: 2rem auto;
      padding: 2rem 1.5rem;
    }
  }
</style>

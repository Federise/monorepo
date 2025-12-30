<script lang="ts">
  import Sidebar from './components/Sidebar.svelte';
  import Settings from './components/Settings.svelte';
  import Notes from './components/demos/Notes.svelte';
  import Files from './components/demos/Files.svelte';
  import { connectionState, hasKVPermissions, hasBlobPermissions, initialized, initializeConnection } from './stores/federise.svelte';
  import { onMount, onDestroy } from 'svelte';

  type View = 'notes' | 'files' | 'settings';

  function getViewFromHash(): View {
    const hash = window.location.hash.slice(1);
    if (hash === 'settings') return 'settings';
    if (hash === 'files') return 'files';
    return 'notes';
  }

  let currentView = $state<View>(getViewFromHash());
  let mobileMenuOpen = $state(false);

  function handleHashChange() {
    currentView = getViewFromHash();
  }

  $effect(() => {
    window.location.hash = currentView;
  });

  onMount(() => {
    initializeConnection();
    window.addEventListener('hashchange', handleHashChange);
  });

  onDestroy(() => {
    window.removeEventListener('hashchange', handleHashChange);
  });
</script>

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
      {/if}
    </main>
  </div>
</div>

<style>
  .app-layout {
    display: flex;
    min-height: 100vh;
  }

  .main-wrapper {
    flex: 1;
    margin-left: 240px;
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  .mobile-header {
    display: none;
  }

  .main-content {
    flex: 1;
    padding: 2rem;
    max-width: 1000px;
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

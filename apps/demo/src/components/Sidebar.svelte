<script lang="ts">
  import {
    connectionState,
    connect,
    disconnect,
    requestPermissions,
    hasKVPermissions,
  } from '../stores/federise.svelte';

  interface Props {
    currentView: 'notes' | 'settings';
    mobileMenuOpen?: boolean;
  }

  let { currentView = $bindable(), mobileMenuOpen = $bindable(false) }: Props = $props();

  let isRequesting = $state(false);

  async function handleConnect() {
    await connect();
  }

  async function handleRequestPermissions() {
    isRequesting = true;
    try {
      await requestPermissions();
    } finally {
      isRequesting = false;
    }
  }

  function navigate(view: 'notes' | 'settings') {
    currentView = view;
    mobileMenuOpen = false;
  }
</script>

<aside class="sidebar" class:open={mobileMenuOpen}>
  <div class="sidebar-header">
    <div class="brand">
      <span class="logo">F</span>
      <span class="brand-text">Federise Demo</span>
    </div>
    <button class="close-btn" onclick={() => (mobileMenuOpen = false)} aria-label="Close menu">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  </div>

  <nav class="nav">
    <button
      class="nav-item"
      class:active={currentView === 'notes'}
      onclick={() => navigate('notes')}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
      Notes
    </button>
  </nav>

  <div class="connection-section">
    <div class="connection-row">
      <div class="connection-status">
        <span
          class="status-dot"
          class:connected={connectionState.value === 'connected'}
          class:connecting={connectionState.value === 'connecting'}
          class:disconnected={connectionState.value === 'disconnected'}
        ></span>
        <span class="status-text">
          {connectionState.value === 'connected'
            ? 'Connected'
            : connectionState.value === 'connecting'
              ? 'Connecting...'
              : 'Disconnected'}
        </span>
      </div>
      <button class="settings-btn" onclick={() => navigate('settings')} aria-label="Settings">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </div>

    <div class="connection-actions">
      {#if connectionState.value === 'disconnected'}
        <button class="btn btn-primary full-width" onclick={handleConnect}>
          Connect
        </button>
      {:else if connectionState.value === 'connected'}
        {#if !hasKVPermissions()}
          <button class="btn btn-primary full-width" onclick={handleRequestPermissions} disabled={isRequesting}>
            {isRequesting ? 'Requesting...' : 'Grant Permissions'}
          </button>
        {/if}
      {/if}
    </div>
  </div>
</aside>

<!-- Mobile overlay -->
{#if mobileMenuOpen}
  <button class="overlay" onclick={() => (mobileMenuOpen = false)} aria-label="Close menu"></button>
{/if}

<style>
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 240px;
    background: var(--color-surface);
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    z-index: 100;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1rem;
    border-bottom: 1px solid var(--color-border);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .logo {
    width: 32px;
    height: 32px;
    background: linear-gradient(135deg, var(--color-primary) 0%, #06b6d4 100%);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 1rem;
  }

  .brand-text {
    font-weight: 600;
    font-size: 1.1rem;
  }

  .close-btn {
    display: none;
    padding: 0.5rem;
    background: transparent;
    border: none;
    color: var(--color-text-muted);
    border-radius: var(--radius);
  }

  .close-btn:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .nav {
    flex: 1;
    padding: 1rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 0.75rem;
    background: transparent;
    border: none;
    border-radius: var(--radius);
    color: var(--color-text-muted);
    font-weight: 500;
    text-align: left;
    transition: all 0.15s ease;
  }

  .nav-item:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .nav-item.active {
    background: var(--color-primary);
    color: white;
  }

  .nav-item.active svg {
    opacity: 1;
  }

  .nav-item svg {
    opacity: 0.7;
    flex-shrink: 0;
  }

  .connection-section {
    padding: 1rem;
    border-top: 1px solid var(--color-border);
  }

  .connection-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
  }

  .connection-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .status-text {
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  .settings-btn {
    padding: 0.375rem;
    background: transparent;
    border: none;
    color: var(--color-text-muted);
    border-radius: var(--radius);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .settings-btn:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .connection-actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .full-width {
    width: 100%;
  }

  .overlay {
    display: none;
    border: none;
    cursor: pointer;
  }

  /* Mobile styles */
  @media (max-width: 768px) {
    .sidebar {
      transform: translateX(-100%);
      transition: transform 0.2s ease;
    }

    .sidebar.open {
      transform: translateX(0);
    }

    .close-btn {
      display: flex;
    }

    .overlay {
      display: block;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 99;
    }
  }
</style>

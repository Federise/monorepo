<script lang="ts">
  import {
    connectionState,
    capabilities,
    requestPermissions,
    hasKVPermissions,
    hasBlobPermissions,
    hasChannelPermissions,
  } from '../stores/federise.svelte';
  import { getNamespace, getNamespaceDisplayName } from '../lib/namespace';

  interface Props {
    currentView: 'notes' | 'files' | 'chat' | 'settings';
    mobileMenuOpen?: boolean;
  }

  let { currentView = $bindable(), mobileMenuOpen = $bindable(false) }: Props = $props();

  let isRequesting = $state(false);

  const namespace = $derived(getNamespace());
  const namespaceDisplay = $derived(getNamespaceDisplayName());
  const isConnected = $derived(connectionState.value === 'connected');
  const hasAllPermissions = $derived(hasKVPermissions() && hasBlobPermissions() && hasChannelPermissions());

  async function handleRequestPermissions() {
    isRequesting = true;
    try {
      await requestPermissions();
    } finally {
      isRequesting = false;
    }
  }

  function navigate(view: 'notes' | 'files' | 'chat' | 'settings') {
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
    <button
      class="nav-item"
      class:active={currentView === 'files'}
      onclick={() => navigate('files')}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
      Files
    </button>
    <button
      class="nav-item"
      class:active={currentView === 'chat'}
      onclick={() => navigate('chat')}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      Chat
    </button>
  </nav>

  <div class="connection-section">
    <!-- Identity Card -->
    <div class="identity-card" class:connected={isConnected}>
      <div class="identity-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </div>
      <div class="identity-info">
        <span class="identity-label">App Identity</span>
        <span class="identity-namespace" title={namespace}>{namespaceDisplay}</span>
      </div>
      <div class="identity-status">
        <span
          class="status-dot"
          class:connected={isConnected}
          class:connecting={connectionState.value === 'connecting'}
          class:disconnected={connectionState.value === 'disconnected'}
        ></span>
      </div>
    </div>

    <!-- Capabilities -->
    {#if isConnected && capabilities.value.length > 0}
      <div class="capabilities">
        <span class="capabilities-label">Permissions</span>
        <div class="capability-badges">
          {#each capabilities.value as cap}
            <span class="capability-badge">{cap}</span>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Actions -->
    <div class="connection-actions">
      {#if connectionState.value === 'connecting'}
        <button class="btn btn-secondary full-width" disabled>
          Connecting...
        </button>
      {:else if isConnected && !hasAllPermissions}
        <button class="btn btn-primary full-width" onclick={handleRequestPermissions} disabled={isRequesting}>
          {isRequesting ? 'Requesting...' : 'Grant Permissions'}
        </button>
      {/if}
    </div>

    <!-- Settings Link -->
    <button class="settings-link" onclick={() => navigate('settings')}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
      Settings
    </button>
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
    padding: 0.75rem;
    border-top: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .identity-card {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.625rem;
    background: var(--color-bg);
    border-radius: var(--radius);
    border: 1px solid var(--color-border);
    transition: border-color 0.2s ease;
  }

  .identity-card.connected {
    border-color: var(--color-primary);
  }

  .identity-icon {
    width: 28px;
    height: 28px;
    background: var(--color-surface-hover);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
  }

  .identity-card.connected .identity-icon {
    background: var(--color-primary);
    color: white;
  }

  .identity-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .identity-label {
    font-size: 0.65rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .identity-namespace {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--color-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .identity-status {
    display: flex;
    align-items: center;
  }

  .capabilities {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .capabilities-label {
    font-size: 0.65rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .capability-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .capability-badge {
    font-size: 0.65rem;
    padding: 0.125rem 0.375rem;
    background: var(--color-surface-hover);
    border-radius: 4px;
    color: var(--color-text-muted);
  }

  .connection-actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .full-width {
    width: 100%;
  }

  .settings-link {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.625rem;
    background: transparent;
    border: none;
    border-radius: var(--radius);
    color: var(--color-text-muted);
    font-size: 0.8rem;
    transition: all 0.15s ease;
  }

  .settings-link:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
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

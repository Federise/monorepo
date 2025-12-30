<script lang="ts">
  import {
    connectionState,
    capabilities,
    connect,
    disconnect,
    requestPermissions,
    hasKVPermissions,
  } from '../stores/federise.svelte';

  interface Props {
    currentView: 'notes' | 'settings';
  }

  let { currentView = $bindable() }: Props = $props();

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
</script>

<header class="header">
  <div class="container header-content">
    <div class="brand">
      <h1>Federise Demo</h1>
    </div>

    <nav class="nav">
      <button
        class="nav-btn"
        class:active={currentView === 'notes'}
        onclick={() => (currentView = 'notes')}
      >
        Notes
      </button>
      <button
        class="nav-btn"
        class:active={currentView === 'settings'}
        onclick={() => (currentView = 'settings')}
      >
        Settings
      </button>
    </nav>

    <div class="connection">
      <span class="status">
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
      </span>

      {#if connectionState.value === 'disconnected'}
        <button class="btn btn-primary" onclick={handleConnect}>Connect</button>
      {:else if connectionState.value === 'connected'}
        {#if !hasKVPermissions()}
          <button class="btn btn-primary" onclick={handleRequestPermissions} disabled={isRequesting}>
            {isRequesting ? 'Requesting...' : 'Request Permissions'}
          </button>
        {/if}
        <button class="btn btn-secondary" onclick={disconnect}>Disconnect</button>
      {/if}
    </div>
  </div>
</header>

<style>
  .header {
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    padding: 1rem 0;
  }

  .header-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .brand h1 {
    font-size: 1.25rem;
    font-weight: 600;
  }

  .nav {
    display: flex;
    gap: 0.25rem;
  }

  .nav-btn {
    padding: 0.5rem 1rem;
    border: none;
    background: transparent;
    border-radius: var(--radius);
    font-weight: 500;
    color: var(--color-text-muted);
    transition: all 0.15s ease;
  }

  .nav-btn:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .nav-btn.active {
    background: var(--color-primary);
    color: white;
  }

  .connection {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .status-text {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }
</style>

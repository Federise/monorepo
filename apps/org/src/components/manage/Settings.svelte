<script lang="ts">
  import { onMount } from 'svelte';

  let settings = $state({
    autoSync: true,
    notifications: true,
    debugMode: false,
  });
  let loaded = $state(false);

  onMount(() => {
    // Load settings from localStorage
    const saved = localStorage.getItem('federise:settings');
    if (saved) {
      try {
        settings = JSON.parse(saved);
      } catch {
        // Use defaults
      }
    }
    loaded = true;
  });

  // Save settings whenever they change
  $effect(() => {
    localStorage.setItem('federise:settings', JSON.stringify(settings));
  });
</script>

{#if loaded}
<div class="page">
  <header class="page-header">
    <h1>Settings</h1>
    <p>Configure your Federise experience.</p>
  </header>

  <section class="card">
    <h2>General</h2>
    <div class="settings-list">
      <label class="setting-row">
        <div class="setting-info">
          <span class="setting-name">Auto-sync</span>
          <span class="setting-desc">Automatically sync data in the background</span>
        </div>
        <input type="checkbox" bind:checked={settings.autoSync} class="toggle" />
      </label>

      <label class="setting-row">
        <div class="setting-info">
          <span class="setting-name">Notifications</span>
          <span class="setting-desc">Receive notifications from connected apps</span>
        </div>
        <input type="checkbox" bind:checked={settings.notifications} class="toggle" />
      </label>

      <label class="setting-row">
        <div class="setting-info">
          <span class="setting-name">Debug Mode</span>
          <span class="setting-desc">Show detailed logs in the console</span>
        </div>
        <input type="checkbox" bind:checked={settings.debugMode} class="toggle" />
      </label>
    </div>
  </section>

  <section class="card">
    <h2>Data Management</h2>
    <div class="button-row">
      <button class="btn btn-secondary">Export All Data</button>
      <button class="btn btn-secondary">Clear Cache</button>
    </div>
  </section>

  <section class="card danger-zone">
    <h2>Reset</h2>
    <p class="card-desc">Clear all Federise data from this browser including credentials and permissions.</p>
    <button class="btn btn-danger">Reset Everything</button>
  </section>
</div>
{/if}

<style>
  .page {
    max-width: 900px;
    padding: 2rem 3rem;
  }

  .page-header {
    margin-bottom: 2rem;
  }

  .page-header h1 {
    font-size: var(--font-size-2xl);
    font-weight: 600;
    margin-bottom: var(--space-sm);
    color: var(--color-white);
  }

  .page-header p {
    color: var(--color-text-muted);
    font-size: 0.95rem;
  }

  .card {
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-xl);
    padding: var(--space-xl);
    margin-bottom: var(--space-xl);
  }

  .card h2 {
    font-size: var(--font-size-lg);
    font-weight: 600;
    margin-bottom: var(--space-sm);
    color: var(--color-white);
  }

  .card-desc {
    font-size: var(--font-size-base);
    color: var(--color-text-muted);
    margin-bottom: var(--space-xl);
  }

  .card.danger-zone {
    border-color: var(--border-error);
  }

  .settings-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .setting-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-lg);
    background: var(--surface-dark);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .setting-row:hover {
    background: var(--surface-darker);
  }

  .setting-info {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .setting-name {
    font-weight: 500;
    color: var(--color-white);
    font-size: var(--font-size-md);
  }

  .setting-desc {
    font-size: var(--font-size-sm);
    color: var(--color-text-subtle);
  }

  .toggle {
    width: 44px;
    height: 24px;
    appearance: none;
    background: var(--surface-3);
    border-radius: var(--radius-xl);
    position: relative;
    cursor: pointer;
    transition: background var(--transition-base);
    flex-shrink: 0;
  }

  .toggle::before {
    content: '';
    position: absolute;
    width: 18px;
    height: 18px;
    background: var(--color-white);
    border-radius: var(--radius-full);
    top: 3px;
    left: 3px;
    transition: transform var(--transition-base);
  }

  .toggle:checked {
    background: var(--color-primary);
  }

  .toggle:checked::before {
    transform: translateX(20px);
  }

  .button-row {
    display: flex;
    gap: var(--space-md);
    flex-wrap: wrap;
  }

  .btn {
    padding: 0.7rem var(--space-xl);
    border-radius: var(--radius-md);
    font-weight: 500;
    font-size: var(--font-size-md);
    font-family: inherit;
    cursor: pointer;
    border: none;
    transition: all var(--transition-fast);
  }

  .btn-secondary {
    background: var(--surface-3);
    color: var(--color-white);
    border: 1px solid var(--border-normal);
  }

  .btn-secondary:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.12);
  }

  .btn-danger {
    background: rgba(239, 68, 68, 0.15);
    color: var(--color-error);
    border: 1px solid var(--border-error);
  }

  .btn-danger:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.25);
  }

  @media (max-width: 900px) {
    .page {
      padding: 1.5rem;
    }
  }
</style>

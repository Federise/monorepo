<script lang="ts">
  import Header from './components/Header.svelte';
  import Settings from './components/Settings.svelte';
  import Notes from './components/demos/Notes.svelte';
  import { connectionState, hasKVPermissions, initialized, initializeConnection } from './stores/federise.svelte';
  import { onMount } from 'svelte';

  let currentView = $state<'notes' | 'settings'>('notes');

  onMount(() => {
    // Try to restore connection on page load
    initializeConnection();
  });
</script>

<div class="app">
  <Header bind:currentView />

  <main class="container">
    {#if !initialized.value}
      <div class="card connect-prompt">
        <h2>Initializing...</h2>
        <p>Restoring your connection to Federise.</p>
      </div>
    {:else if currentView === 'settings'}
      <Settings />
    {:else if currentView === 'notes'}
      {#if connectionState.value === 'connected' && hasKVPermissions()}
        <Notes />
      {:else}
        <div class="card connect-prompt">
          <h2>Notes Demo</h2>
          <p>Connect to Federise and grant KV permissions to use the notes demo.</p>
          {#if connectionState.value === 'disconnected'}
            <p class="hint">Click "Connect" in the header to get started.</p>
          {:else if connectionState.value === 'connected'}
            <p class="hint">Click "Request Permissions" to grant KV access.</p>
          {/if}
        </div>
      {/if}
    {/if}
  </main>
</div>

<style>
  .app {
    min-height: 100vh;
  }

  main {
    padding: 2rem 1rem;
  }

  .connect-prompt {
    text-align: center;
    max-width: 500px;
    margin: 0 auto;
  }

  .connect-prompt h2 {
    margin-bottom: 1rem;
  }

  .connect-prompt p {
    color: var(--color-text-muted);
    margin-bottom: 0.5rem;
  }

  .connect-prompt .hint {
    font-size: 0.875rem;
    margin-top: 1rem;
  }
</style>

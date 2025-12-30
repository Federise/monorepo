<script lang="ts">
  import {
    frameUrl,
    setFrameUrl,
    connectionState,
    disconnect,
  } from '../stores/federise.svelte';

  let inputValue = $state(frameUrl.value);
  let saved = $state(false);

  function handleSave() {
    // Disconnect if connected before changing URL
    if (connectionState.value !== 'disconnected') {
      disconnect();
    }

    setFrameUrl(inputValue);
    saved = true;
    setTimeout(() => {
      saved = false;
    }, 2000);
  }

  function setLocal() {
    inputValue = 'http://localhost:4321/frame';
  }

  function setProduction() {
    inputValue = 'https://federise.org/frame';
  }
</script>

<div class="settings card">
  <h2>Settings</h2>

  <div class="setting-group">
    <label for="frame-url">Federise Frame URL</label>
    <p class="description">
      Configure which Federise instance to connect to. Use localhost for development or
      federise.org for production.
    </p>

    <div class="presets">
      <button class="btn btn-secondary" onclick={setLocal}>Local (localhost:4321)</button>
      <button class="btn btn-secondary" onclick={setProduction}>Production (federise.org)</button>
    </div>

    <input
      id="frame-url"
      type="url"
      class="input"
      bind:value={inputValue}
      placeholder="https://federise.org/frame"
    />

    <div class="actions">
      <button class="btn btn-primary" onclick={handleSave}>
        {saved ? 'Saved!' : 'Save'}
      </button>
    </div>
  </div>
</div>

<style>
  .settings {
    max-width: 600px;
    margin: 0 auto;
  }

  h2 {
    margin-bottom: 1.5rem;
  }

  .setting-group {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  label {
    font-weight: 500;
  }

  .description {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .presets {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .actions {
    margin-top: 0.5rem;
  }
</style>

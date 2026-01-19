<script lang="ts">
  import {
    frameUrl,
    setFrameUrl,
    connectionState,
    disconnect,
    connect,
    testConnection,
    frameVerified,
  } from '../stores/federise.svelte';

  let inputValue = $state(frameUrl.value);
  let isTesting = $state(false);
  let testResult = $state<'success' | 'failed' | null>(null);

  async function handleTest() {
    // Save the URL first
    if (connectionState.value !== 'disconnected') {
      disconnect();
    }
    setFrameUrl(inputValue);

    // Test the connection
    isTesting = true;
    testResult = null;

    const success = await testConnection();
    testResult = success ? 'success' : 'failed';
    isTesting = false;

    // If successful, auto-connect
    if (success) {
      try {
        await connect();
      } catch {
        // Ignore - we already showed success for the test
      }
    }
  }

  function setLocal() {
    inputValue = 'http://localhost:4321/frame';
    testResult = null;
  }

  function setProduction() {
    inputValue = 'https://federise.org/frame';
    testResult = null;
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
      <button class="btn btn-primary" onclick={handleTest} disabled={isTesting}>
        {#if isTesting}
          Testing...
        {:else if testResult === 'success'}
          Connected!
        {:else}
          Test Connection
        {/if}
      </button>
    </div>

    {#if testResult === 'failed'}
      <p class="error-message">
        Failed to connect. Check the URL and ensure the frame is running.
      </p>
    {:else if testResult === 'success'}
      <p class="success-message">
        Connection verified! You can now use the app.
      </p>
    {:else if !frameVerified.value}
      <p class="info-message">
        Test the connection to enable the app.
      </p>
    {/if}
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

  .error-message {
    color: var(--color-error, #ef4444);
    font-size: 0.875rem;
    margin-top: 0.5rem;
  }

  .success-message {
    color: var(--color-success, #22c55e);
    font-size: 0.875rem;
    margin-top: 0.5rem;
  }

  .info-message {
    color: var(--color-text-muted);
    font-size: 0.875rem;
    margin-top: 0.5rem;
  }
</style>

<script lang="ts">
  import { onMount } from 'svelte';
  import { createGatewayClient, withAuth } from '../../api/client';

  const STORAGE_KEY_API = 'federise:gateway:apiKey';
  const STORAGE_KEY_URL = 'federise:gateway:url';

  // Gateway state
  let gatewayUrl = $state('');
  let apiKey = $state('');
  let isConnected = $state(false);

  // Test connection state
  let testUrl = $state('');
  let testApiKey = $state('');
  let testStatus = $state<'idle' | 'testing' | 'success' | 'error'>('idle');
  let testMessage = $state('');
  let showTestApiKey = $state(false);
  let showApiKey = $state(false);
  let showLoginForm = $state(false);
  let loaded = $state(false);

  onMount(async () => {
    const savedKey = localStorage.getItem(STORAGE_KEY_API);
    const savedUrl = localStorage.getItem(STORAGE_KEY_URL);

    if (savedKey && savedUrl) {
      apiKey = savedKey;
      gatewayUrl = savedUrl;
      testUrl = savedUrl;
      testApiKey = savedKey;
      await checkConnection();
    }
    loaded = true;
  });

  async function checkConnection() {
    if (!gatewayUrl || !apiKey) {
      isConnected = false;
      return;
    }

    try {
      const client = createGatewayClient(gatewayUrl);
      const { data } = await client.GET('/ping', withAuth(apiKey));
      isConnected = data?.message === 'pong';
    } catch {
      isConnected = false;
    }
  }

  function showToast(message: string) {
    const event = new CustomEvent('show-toast', { detail: message });
    window.dispatchEvent(event);
  }

  async function testConnection() {
    if (!testUrl || !testApiKey) {
      testStatus = 'error';
      testMessage = 'Please enter both URL and API key';
      return;
    }

    testStatus = 'testing';
    testMessage = 'Testing connection...';

    try {
      const client = createGatewayClient(testUrl);
      const { data } = await client.GET('/ping', withAuth(testApiKey));

      if (data?.message === 'pong') {
        testStatus = 'success';
        testMessage = 'Connection successful!';
      } else {
        testStatus = 'error';
        testMessage = 'Unexpected response from gateway';
      }
    } catch (e) {
      testStatus = 'error';
      testMessage = 'Failed to connect. Check the URL and API key.';
    }
  }

  function saveCredentials() {
    localStorage.setItem(STORAGE_KEY_URL, testUrl);
    localStorage.setItem(STORAGE_KEY_API, testApiKey);
    gatewayUrl = testUrl;
    apiKey = testApiKey;
    isConnected = true;
    showLoginForm = false;
    testStatus = 'idle';
    testMessage = '';
    showToast('Gateway credentials saved!');
  }

  function disconnect() {
    localStorage.removeItem(STORAGE_KEY_API);
    localStorage.removeItem(STORAGE_KEY_URL);
    apiKey = '';
    gatewayUrl = '';
    testUrl = '';
    testApiKey = '';
    isConnected = false;
    testStatus = 'idle';
    testMessage = '';
    showToast('Gateway disconnected');
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    showToast(`${label} copied!`);
  }
</script>

{#if loaded}
<div class="page">
  <header class="page-header">
    <h1>Gateway Connection</h1>
    <p>Connect to your Federise Gateway by entering its URL and API key.</p>
  </header>

  {#if !isConnected || showLoginForm}
  <section class="card">
    <h2>Test Connection</h2>
    <p class="card-desc">Enter your gateway credentials to test the connection before saving.</p>

    <div class="form-group">
      <label for="test-url">Gateway URL</label>
      <input
        id="test-url"
        type="url"
        bind:value={testUrl}
        placeholder="https://your-gateway.workers.dev"
        class="input"
      />
    </div>

    <div class="form-group">
      <label for="test-key">API Key</label>
      <div class="input-group">
        <input
          id="test-key"
          type={showTestApiKey ? 'text' : 'password'}
          bind:value={testApiKey}
          placeholder="Enter your API key"
          class="input"
        />
        <button class="btn-icon" onclick={() => (showTestApiKey = !showTestApiKey)}>
          {showTestApiKey ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>

    {#if testStatus !== 'idle'}
      <div class="test-result {testStatus}">
        {#if testStatus === 'testing'}
          <span class="spinner"></span>
        {:else if testStatus === 'success'}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        {:else}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        {/if}
        <span>{testMessage}</span>
      </div>
    {/if}

    <div class="button-row">
      <button class="btn btn-secondary" onclick={testConnection} disabled={testStatus === 'testing'}>
        Test Connection
      </button>
      {#if testStatus === 'success'}
        <button class="btn btn-primary" onclick={saveCredentials}>
          Save & Connect
        </button>
      {/if}
    </div>
  </section>
  {/if}

  {#if isConnected}
    <section class="card">
      <div class="card-header">
        <h2>Current Connection</h2>
        {#if !showLoginForm}
          <button class="btn btn-secondary" onclick={() => (showLoginForm = true)}>
            Change Connection
          </button>
        {/if}
      </div>
      <div class="info-grid">
        <div class="info-item">
          <span class="info-label">Gateway URL</span>
          <div class="info-value-row">
            <code class="info-value">{gatewayUrl}</code>
            <button class="btn-icon-small" onclick={() => copyToClipboard(gatewayUrl, 'URL')}>
              Copy
            </button>
          </div>
        </div>
        <div class="info-item">
          <span class="info-label">API Key</span>
          <div class="info-value-row">
            <code class="info-value">{showApiKey ? apiKey : '•'.repeat(32)}</code>
            <button class="btn-icon-small" onclick={() => (showApiKey = !showApiKey)}>
              {showApiKey ? 'Hide' : 'Show'}
            </button>
            <button class="btn-icon-small" onclick={() => copyToClipboard(apiKey, 'API key')}>
              Copy
            </button>
          </div>
        </div>
      </div>
    </section>

    <section class="card danger-zone">
      <h2>Danger Zone</h2>
      <p class="card-desc">Disconnect this gateway from your browser. You'll need to re-enter credentials to use it again.</p>
      <button class="btn btn-danger" onclick={disconnect}>Disconnect Gateway</button>
    </section>
  {/if}
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

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-lg);
  }

  .card-header h2 {
    margin-bottom: 0;
  }

  .card-desc {
    font-size: var(--font-size-base);
    color: var(--color-text-muted);
    margin-bottom: var(--space-xl);
  }

  .card.danger-zone {
    border-color: var(--border-error);
  }

  .form-group {
    margin-bottom: var(--space-xl);
  }

  .form-group label {
    display: block;
    font-size: var(--font-size-base);
    font-weight: 500;
    color: #ccc;
    margin-bottom: var(--space-sm);
  }

  .input {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    padding: var(--space-md) var(--space-lg);
    background: var(--surface-darker);
    border: 1px solid var(--border-normal);
    border-radius: var(--radius-md);
    color: var(--color-white);
    font-size: var(--font-size-md);
    font-family: inherit;
    transition: border-color var(--transition-fast);
  }

  .input:focus {
    outline: none;
    border-color: var(--border-primary);
  }

  .input::placeholder {
    color: #555;
  }

  .input-group {
    display: flex;
    gap: var(--space-sm);
  }

  .input-group .input {
    flex: 1;
    min-width: 0;
  }

  .test-result {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-lg);
    border-radius: var(--radius-md);
    font-size: var(--font-size-md);
    margin-bottom: var(--space-xl);
  }

  .test-result.testing {
    background: var(--color-primary-light);
    color: #a78bfa;
  }

  .test-result.success {
    background: var(--color-success-bg);
    color: var(--color-success);
  }

  .test-result.error {
    background: var(--color-error-bg);
    color: var(--color-error);
  }

  .spinner {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(139, 92, 246, 0.3);
    border-top-color: var(--color-primary);
    border-radius: var(--radius-full);
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
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

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: var(--color-primary);
    color: var(--color-white);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--color-primary-hover);
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

  .btn-icon {
    padding: 0.7rem var(--space-lg);
    background: var(--surface-3);
    border: 1px solid var(--border-normal);
    border-radius: var(--radius-md);
    color: var(--color-white);
    font-size: var(--font-size-base);
    font-family: inherit;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .btn-icon:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  .btn-icon-small {
    padding: 0.4rem 0.7rem;
    background: var(--surface-2);
    border: 1px solid var(--border-muted);
    border-radius: var(--radius-sm);
    color: #aaa;
    font-size: var(--font-size-sm);
    font-family: inherit;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .btn-icon-small:hover {
    background: var(--surface-3);
    color: var(--color-white);
  }

  .info-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .info-item {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .info-label {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
    font-weight: 500;
  }

  .info-value-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .info-value {
    flex: 1;
    padding: 0.6rem 0.9rem;
    background: var(--surface-darker);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-base);
    color: #aaa;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 768px) {
    .page {
      padding: 1rem;
    }

    .page-header h1 {
      font-size: 1.5rem;
    }

    .card {
      padding: var(--space-lg);
    }

    .card-header {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-md);
    }

    .info-value {
      font-size: var(--font-size-sm);
      word-break: break-all;
      white-space: normal;
    }

    .info-value-row {
      flex-wrap: wrap;
    }

    .input-group {
      flex-direction: column;
    }

    .btn-icon {
      width: 100%;
    }

    .button-row {
      width: 100%;
    }

    .button-row .btn {
      flex: 1;
      min-width: 0;
    }
  }
</style>

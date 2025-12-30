<script lang="ts">
  import { onMount } from 'svelte';
  import { createGatewayClient, withAuth } from '../../api/client';
  import { getGatewayConfig, saveGatewayConfig } from '../../utils/auth';

  // Gateway state
  let gatewayUrl = $state('');
  let apiKey = $state('');
  let isConnected = $state(false);

  // Recovery state
  let bootstrapKey = $state('');
  let showBootstrapKey = $state(false);
  let newPrincipalUrl = $state('');
  let newPrincipalKey = $state('');
  let recoveryStatus = $state<'idle' | 'processing' | 'success' | 'error'>('idle');
  let recoveryMessage = $state('');
  let loaded = $state(false);

  onMount(() => {
    const config = getGatewayConfig();

    if (config.apiKey && config.url) {
      apiKey = config.apiKey;
      gatewayUrl = config.url;
    }
    loaded = true;
  });

  function showToast(message: string) {
    const event = new CustomEvent('show-toast', { detail: message });
    window.dispatchEvent(event);
  }

  function generateBootstrapKey() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    bootstrapKey = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    showToast('Bootstrap key generated');
  }

  async function createFirstPrincipal() {
    if (!newPrincipalUrl || !bootstrapKey) {
      recoveryStatus = 'error';
      recoveryMessage = 'Gateway URL and bootstrap key are required';
      return;
    }

    recoveryStatus = 'processing';
    recoveryMessage = 'Creating first principal...';

    try {
      const client = createGatewayClient(newPrincipalUrl);
      const { data, error } = await client.POST('/principal/create', {
        ...withAuth(bootstrapKey),
        body: { display_name: 'Recovery Principal' },
      });

      if (error) {
        recoveryStatus = 'error';
        recoveryMessage = error.message || 'Failed to create principal';
        return;
      }

      if (data?.secret) {
        newPrincipalKey = data.secret;
        recoveryStatus = 'success';
        recoveryMessage = 'First principal created! Save this API key.';
      } else {
        recoveryStatus = 'error';
        recoveryMessage = 'Unexpected response from gateway';
      }
    } catch (e) {
      recoveryStatus = 'error';
      recoveryMessage = 'Failed to create principal. Verify the bootstrap key matches your worker configuration and that all principals have been deleted.';
    }
  }

  function saveRecoveredCredentials() {
    if (!newPrincipalUrl || !newPrincipalKey) return;

    saveGatewayConfig(newPrincipalKey, newPrincipalUrl);
    gatewayUrl = newPrincipalUrl;
    apiKey = newPrincipalKey;
    isConnected = false;

    // Reset recovery state
    bootstrapKey = '';
    newPrincipalUrl = '';
    newPrincipalKey = '';
    recoveryStatus = 'idle';
    recoveryMessage = '';

    showToast('Credentials saved! Verifying connection...');
    window.location.href = '/manage/connection';
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    showToast(`${label} copied!`);
  }
</script>

{#if loaded}
<div class="page">
  <header class="page-header">
    <h1>Recovery</h1>
    <p>Recover access to your gateway by generating a new bootstrap key and creating a new first principal.</p>
  </header>

  <section class="card warning-zone">
    <h2>⚠️ Warning</h2>
    <p class="card-desc">This recovery process requires you to manually delete all existing principals from your gateway. Only use this if you've lost access to your gateway. You must have access to:</p>
    <ul style="color: var(--color-text); margin: var(--space-md) 0 0 var(--space-xl); line-height: 1.6;">
      <li>Update your Cloudflare Worker's environment variables</li>
      <li>Access your gateway's KV storage to delete principals manually</li>
    </ul>
  </section>

  <section class="card">
    <h2>Step 1: Generate Bootstrap Key</h2>
    <p class="card-desc">Generate a new bootstrap key and add it to your Cloudflare Worker's BOOTSTRAP_API_KEY environment variable.</p>

    {#if !bootstrapKey}
      <button class="btn btn-primary" onclick={generateBootstrapKey}>
        Generate Bootstrap Key
      </button>
    {:else}
      <div class="form-group">
        <label for="bootstrap-key">Bootstrap Key (add this to your Worker's BOOTSTRAP_API_KEY env variable)</label>
        <div class="input-group">
          <input
            id="bootstrap-key"
            type={showBootstrapKey ? 'text' : 'password'}
            value={bootstrapKey}
            readonly
            class="input"
          />
          <button class="btn-icon" onclick={() => (showBootstrapKey = !showBootstrapKey)}>
            {showBootstrapKey ? 'Hide' : 'Show'}
          </button>
          <button class="btn-icon" onclick={() => copyToClipboard(bootstrapKey, 'Bootstrap key')}>
            Copy
          </button>
        </div>
      </div>
      <div class="info-banner">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
        <span>Copy this key and update your Cloudflare Worker's BOOTSTRAP_API_KEY environment variable before proceeding.</span>
      </div>
    {/if}
  </section>

  {#if bootstrapKey}
    <section class="card danger-zone">
      <h2>Step 2: Delete All Principals Manually</h2>
      <p class="card-desc">You need to manually delete all principals from your gateway's KV storage before creating a new first principal.</p>

      <div class="info-banner warning">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <div>
          <p style="margin: 0 0 var(--space-sm) 0; font-weight: 600;">Manual Steps Required:</p>
          <ol style="margin: 0; padding-left: var(--space-lg); line-height: 1.6;">
            <li>Go to your Cloudflare Dashboard</li>
            <li>Navigate to Workers & Pages → KV</li>
            <li>Open your gateway's KV namespace</li>
            <li>Delete all principal keys (they start with "principal:")</li>
            <li>Return here to create the first principal</li>
          </ol>
        </div>
      </div>
    </section>

    <section class="card">
      <h2>Step 3: Create First Principal</h2>
      <p class="card-desc">After updating the bootstrap key and deleting all principals, create a new first principal.</p>

      {#if newPrincipalKey}
        <div class="test-result success">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span>{recoveryMessage}</span>
        </div>

        <div class="form-group">
          <label for="new-principal-key">New API Key (save this!)</label>
          <div class="input-group">
            <input
              id="new-principal-key"
              type="text"
              value={newPrincipalKey}
              readonly
              class="input"
            />
            <button class="btn-icon" onclick={() => copyToClipboard(newPrincipalKey, 'API key')}>
              Copy
            </button>
          </div>
        </div>
      {:else}
        {#if recoveryStatus === 'error' && recoveryMessage}
          <div class="test-result error">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <span>{recoveryMessage}</span>
          </div>
        {/if}

        <div class="form-group">
          <label for="new-principal-url">Gateway URL</label>
          <input
            id="new-principal-url"
            type="url"
            bind:value={newPrincipalUrl}
            placeholder="https://your-gateway.workers.dev"
            class="input"
          />
        </div>

        <div class="form-group">
          <label for="recovery-bootstrap-key">Bootstrap Key</label>
          <input
            id="recovery-bootstrap-key"
            type="text"
            value={bootstrapKey}
            readonly
            class="input"
          />
        </div>

        <button
          class="btn btn-primary"
          onclick={createFirstPrincipal}
          disabled={recoveryStatus === 'processing'}
        >
          {recoveryStatus === 'processing' ? 'Creating...' : 'Create First Principal'}
        </button>
      {/if}
    </section>
  {/if}

  {#if newPrincipalKey}
    <section class="card">
      <h2>Step 4: Save Credentials</h2>
      <p class="card-desc">Save the new credentials to connect to your gateway.</p>

      <button class="btn btn-primary" onclick={saveRecoveredCredentials}>
        Save and Connect
      </button>
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

  .card-desc {
    font-size: var(--font-size-base);
    color: var(--color-text-muted);
    margin-bottom: var(--space-xl);
  }

  .card.danger-zone {
    border-color: var(--border-error);
  }

  .card.warning-zone {
    border-color: rgba(234, 179, 8, 0.3);
    background: var(--color-warning-bg);
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

  .test-result.success {
    background: var(--color-success-bg);
    color: var(--color-success);
  }

  .test-result.error {
    background: var(--color-error-bg);
    color: var(--color-error);
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

  .info-banner {
    display: flex;
    align-items: flex-start;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-lg);
    background: var(--color-primary-light);
    border: 1px solid rgba(139, 92, 246, 0.3);
    border-radius: var(--radius-md);
    color: #a78bfa;
    font-size: var(--font-size-sm);
    margin-top: var(--space-md);
  }

  .info-banner svg {
    flex-shrink: 0;
    margin-top: 2px;
  }

  .info-banner.warning {
    background: var(--color-warning-bg);
    border-color: rgba(234, 179, 8, 0.3);
    color: var(--color-warning);
  }

  @media (max-width: 900px) {
    .page {
      padding: 1.5rem;
    }
  }
</style>

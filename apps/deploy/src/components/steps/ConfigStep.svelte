<script lang="ts">
  import { deploymentStore } from '../../lib/stores/deployment.svelte.js';
  import SecretInput from '../ui/SecretInput.svelte';

  let bootstrapKey = $state(deploymentStore.state.bootstrapApiKey ?? '');
  let r2AccountId = $state(deploymentStore.state.r2AccountId ?? '');
  let r2AccessKeyId = $state(deploymentStore.state.r2AccessKeyId ?? '');
  let r2SecretAccessKey = $state(deploymentStore.state.r2SecretAccessKey ?? '');
  let showR2Config = $state(false);

  // Generate key on mount if not set
  $effect(() => {
    if (!bootstrapKey) {
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      bootstrapKey = Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
    }
  });

  function handleContinue() {
    deploymentStore.setConfig({
      bootstrapApiKey: bootstrapKey,
      r2AccountId: r2AccountId || undefined,
      r2AccessKeyId: r2AccessKeyId || undefined,
      r2SecretAccessKey: r2SecretAccessKey || undefined
    });
    deploymentStore.setStep('deploy');
  }

  function handleBack() {
    deploymentStore.setStep('auth');
  }

  $effect(() => {
    if (r2AccountId || r2AccessKeyId || r2SecretAccessKey) {
      showR2Config = true;
    }
  });
</script>

<div class="config-step">
  <h2>Configure Your Gateway</h2>
  <p class="description">
    Set up the authentication key and optional R2 presigned URL credentials.
  </p>

  <div class="config-section">
    <h3>Bootstrap API Key</h3>
    <p class="section-desc">
      This key is used to create the first principal (admin user) for your gateway.
      Keep it secure - you'll need it to set up your gateway after deployment.
    </p>

    <SecretInput
      label="Bootstrap API Key"
      bind:value={bootstrapKey}
      placeholder="256-bit hex key"
      helpText="A random key has been generated. You can regenerate or paste your own."
      required
    />
  </div>

  <div class="config-section">
    <div class="section-header">
      <h3>R2 Presigned URLs</h3>
      <button class="toggle-btn" onclick={() => (showR2Config = !showR2Config)}>
        {showR2Config ? 'Hide' : 'Configure'}
      </button>
    </div>
    <p class="section-desc">
      Optional. Enable presigned upload URLs for direct client uploads to R2.
    </p>

    {#if showR2Config}
      <div class="r2-fields">
        <p class="r2-info">
          Create an R2 API token at{' '}
          <a href="https://dash.cloudflare.com/" target="_blank" rel="noopener">
            Cloudflare Dashboard → R2 → Manage R2 API Tokens
          </a>
        </p>

        <SecretInput
          label="R2 Account ID"
          bind:value={r2AccountId}
          placeholder="Your Cloudflare Account ID"
          helpText="Found in your Cloudflare dashboard URL or R2 settings"
        />

        <SecretInput
          label="R2 Access Key ID"
          bind:value={r2AccessKeyId}
          placeholder="R2 API token Access Key ID"
        />

        <SecretInput
          label="R2 Secret Access Key"
          bind:value={r2SecretAccessKey}
          placeholder="R2 API token Secret Access Key"
        />
      </div>
    {/if}
  </div>

  <div class="actions">
    <button class="secondary-btn" onclick={handleBack}>
      Back
    </button>
    <button
      class="primary-btn"
      onclick={handleContinue}
      disabled={!bootstrapKey}
    >
      Continue to Deploy
    </button>
  </div>
</div>

<style>
  .config-step {
    background: var(--surface-1);
    border: 1px solid var(--border-muted);
    border-radius: var(--radius-lg);
    padding: var(--space-2xl);
  }

  h2 {
    font-size: var(--font-size-xl);
    margin-bottom: var(--space-sm);
  }

  h3 {
    font-size: var(--font-size-lg);
    margin-bottom: var(--space-sm);
  }

  .description {
    color: var(--color-text-muted);
    margin-bottom: var(--space-2xl);
  }

  .config-section {
    background: var(--surface-2);
    border-radius: var(--radius-md);
    padding: var(--space-xl);
    margin-bottom: var(--space-xl);
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .section-desc {
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
    margin-bottom: var(--space-lg);
  }

  .toggle-btn {
    background: var(--surface-3);
    border: none;
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    font-size: var(--font-size-xs);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .toggle-btn:hover {
    background: var(--border-muted);
    color: var(--color-text);
  }

  .r2-fields {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    margin-top: var(--space-lg);
    padding-top: var(--space-lg);
    border-top: 1px solid var(--border-subtle);
  }

  .r2-info {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
    margin: 0;
  }

  .r2-info a {
    color: var(--color-primary);
    text-decoration: none;
  }

  .r2-info a:hover {
    text-decoration: underline;
  }

  .actions {
    display: flex;
    justify-content: space-between;
    margin-top: var(--space-2xl);
  }

  .primary-btn, .secondary-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-xl);
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .primary-btn {
    background: var(--color-primary);
    color: white;
    border: none;
  }

  .primary-btn:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .primary-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .secondary-btn {
    background: transparent;
    color: var(--color-text-muted);
    border: 1px solid var(--border-muted);
  }

  .secondary-btn:hover {
    background: var(--surface-2);
    color: var(--color-text);
  }
</style>

<script lang="ts">
  import { onMount } from 'svelte';
  import { type Capability, CAPABILITY_LABELS } from '../lib/protocol';
  import { grantCapabilities } from '../lib/permissions';

  let appOrigin = $state('');
  let requestedCapabilities = $state<Capability[]>([]);
  let isProcessing = $state(false);
  let error = $state('');

  onMount(() => {
    // Parse parameters from hash (format: #app_origin=...&scope=...)
    const hash = window.location.hash.slice(1); // Remove leading #
    const params = new URLSearchParams(hash);
    const origin = params.get('app_origin');
    const scope = params.get('scope');

    if (!origin || !scope) {
      error = 'Missing required parameters';
      return;
    }

    appOrigin = origin;
    requestedCapabilities = scope.split(',').filter(Boolean) as Capability[];

    if (requestedCapabilities.length === 0) {
      error = 'No capabilities requested';
    }
  });

  function getDisplayOrigin(origin: string): string {
    try {
      const url = new URL(origin);
      return url.hostname;
    } catch {
      return origin;
    }
  }

  async function handleApprove(): Promise<void> {
    isProcessing = true;

    try {
      // Save permissions directly to KV
      // No BroadcastChannel needed - SDK will re-request after popup closes
      await grantCapabilities(appOrigin, requestedCapabilities);

      // Close popup - SDK will detect closure and re-request capabilities
      window.close();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to save permissions';
      isProcessing = false;
    }
  }

  function handleDeny(): void {
    window.close();
  }
</script>

<div class="authorize-container">
  {#if error}
    <div class="error-state">
      <h2>Error</h2>
      <p>{error}</p>
      <button class="btn btn-secondary" onclick={() => window.close()}>Close</button>
    </div>
  {:else}
    <div class="header">
      <div class="logo">
        <span class="logo-icon">F</span>
      </div>
      <h1>Permission Request</h1>
    </div>

    <div class="app-info">
      <span class="app-origin">{getDisplayOrigin(appOrigin)}</span>
      <p class="origin-full">{appOrigin}</p>
      <p class="request-text">is requesting access to:</p>
    </div>

    <ul class="capabilities-list">
      {#each requestedCapabilities as cap}
        <li class="capability-item">
          <span class="capability-icon">
            {#if cap.startsWith('kv:')}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18" />
                <path d="M9 21V9" />
              </svg>
            {:else if cap.startsWith('blob:')}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            {:else if cap === 'notifications'}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            {:else}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
            {/if}
          </span>
          <span class="capability-label">{CAPABILITY_LABELS[cap] ?? cap}</span>
        </li>
      {/each}
    </ul>

    <div class="warning">
      <p>Only approve if you trust this application. It will be able to access the capabilities listed above.</p>
    </div>

    <div class="actions">
      <button class="btn btn-secondary" onclick={handleDeny} disabled={isProcessing}>
        Deny
      </button>
      <button class="btn btn-primary" onclick={handleApprove} disabled={isProcessing}>
        {isProcessing ? 'Approving...' : 'Approve'}
      </button>
    </div>
  {/if}
</div>

<style>
  :root {
    background: rgba(20, 20, 20, 0.9);
  }
  
  .authorize-container {
    background: rgba(20, 20, 20, 0.9);
    border: 1px solid var(--border-normal);
    border-radius: var(--radius-xl);
    padding: var(--space-2xl);
    max-width: 400px;
    width: 100%;
    backdrop-filter: blur(10px);
  }

  .error-state {
    text-align: center;
  }

  .error-state h2 {
    color: var(--color-error);
    margin-bottom: var(--space-sm);
  }

  .error-state p {
    color: var(--color-text);
    margin-bottom: var(--space-xl);
  }

  .header {
    text-align: center;
    margin-bottom: var(--space-xl);
  }

  .logo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
    border-radius: var(--radius-xl);
    margin-bottom: var(--space-lg);
  }

  .logo-icon {
    font-size: var(--font-size-xl);
    font-weight: 700;
    color: var(--color-white);
  }

  .header h1 {
    font-size: var(--font-size-xl);
    margin: 0;
    color: var(--color-white);
  }

  .app-info {
    text-align: center;
    margin-bottom: var(--space-xl);
  }

  .app-origin {
    display: inline-block;
    padding: var(--space-sm) var(--space-lg);
    background: var(--color-primary-light);
    border-radius: var(--radius-md);
    font-weight: 600;
    color: #a78bfa;
    font-size: var(--font-size-lg);
  }

  .origin-full {
    font-size: var(--font-size-sm);
    color: var(--color-text-subtle);
    margin: var(--space-sm) 0;
    word-break: break-all;
  }

  .request-text {
    color: var(--color-text);
    margin: 0;
    font-size: var(--font-size-md);
  }

  .capabilities-list {
    list-style: none;
    padding: 0;
    margin: 0 0 var(--space-xl) 0;
  }

  .capability-item {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-lg);
    background: var(--surface-darker);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-sm);
  }

  .capability-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: var(--color-primary-light);
    border-radius: var(--radius-md);
    color: #a78bfa;
    flex-shrink: 0;
  }

  .capability-label {
    color: var(--color-white);
    font-size: var(--font-size-md);
  }

  .warning {
    background: var(--color-warning-bg);
    border: 1px solid rgba(234, 179, 8, 0.2);
    border-radius: var(--radius-md);
    padding: var(--space-md) var(--space-lg);
    margin-bottom: var(--space-xl);
  }

  .warning p {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-warning);
  }

  .actions {
    display: flex;
    gap: var(--space-md);
  }

  .btn {
    flex: 1;
    padding: var(--space-md) var(--space-xl);
    border-radius: var(--radius-md);
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: all var(--transition-base);
    border: none;
    font-size: var(--font-size-md);
  }

  .btn:disabled {
    opacity: 0.6;
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
    background: rgba(255, 255, 255, 0.15);
  }
</style>

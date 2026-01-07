<script lang="ts">
  import { deploymentStore } from '../../lib/stores/deployment.svelte.js';
  import { terminalStore } from '../terminal/TerminalStore.svelte.js';

  let isTesting = $state(false);
  let testResult = $state<'success' | 'error' | null>(null);
  let testError = $state<string | null>(null);

  const deployState = deploymentStore.state;
  const workerUrl = deployState.workerUrl ?? 'https://federise-gateway.workers.dev';

  async function testGateway() {
    isTesting = true;
    testResult = null;
    testError = null;

    try {
      const response = await fetch(`${workerUrl}/ping`, {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.message === 'pong') {
          testResult = 'success';
          terminalStore.writeLine?.('\n\x1b[32m✓ Gateway test successful!\x1b[0m');
        } else {
          throw new Error('Unexpected response');
        }
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (e) {
      testResult = 'error';
      testError = e instanceof Error ? e.message : 'Test failed';
      terminalStore.writeLine?.(`\n\x1b[31m✗ Gateway test failed: ${testError}\x1b[0m`);
    } finally {
      isTesting = false;
    }
  }

  function handleNewDeployment() {
    deploymentStore.reset();
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }
</script>

<div class="success-step">
  <div class="success-header">
    <div class="success-icon">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clip-rule="evenodd" />
      </svg>
    </div>
    <h2>Deployment Complete!</h2>
    <p class="description">
      Your Federise gateway is now live on Cloudflare Workers.
    </p>
  </div>

  <div class="info-section">
    <h3>Gateway URL</h3>
    <div class="url-box">
      <code>{workerUrl}</code>
      <button class="copy-btn" onclick={() => copyToClipboard(workerUrl)} title="Copy URL">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
          <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
          <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
        </svg>
      </button>
    </div>

    <div class="test-section">
      <button
        class="secondary-btn"
        onclick={testGateway}
        disabled={isTesting}
      >
        {#if isTesting}
          <span class="spinner"></span>
          Testing...
        {:else}
          Test Gateway
        {/if}
      </button>

      {#if testResult === 'success'}
        <span class="test-result success">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
          </svg>
          Connected
        </span>
      {:else if testResult === 'error'}
        <span class="test-result error">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
          </svg>
          {testError}
        </span>
      {/if}
    </div>
  </div>

  <div class="info-section">
    <h3>Bootstrap API Key</h3>
    <p class="section-desc">
      Use this key to create your first principal (admin user).
    </p>
    <div class="url-box">
      <code class="masked">{deployState.bootstrapApiKey?.slice(0, 8)}...{deployState.bootstrapApiKey?.slice(-8)}</code>
      <button
        class="copy-btn"
        onclick={() => copyToClipboard(deployState.bootstrapApiKey ?? '')}
        title="Copy Key"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
          <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
          <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
        </svg>
      </button>
    </div>
  </div>

  <div class="next-steps">
    <h3>Next Steps</h3>
    <ol class="steps-list">
      <li>
        <strong>Create a Principal</strong>
        <p>Use the bootstrap key to create your first admin user via the <code>/principal/create</code> endpoint.</p>
      </li>
      <li>
        <strong>Configure Your Application</strong>
        <p>Point your Federise client to <code>{workerUrl}</code></p>
      </li>
      <li>
        <strong>Enable Public R2</strong>
        <p>If you want public blob URLs, configure a custom domain for your R2 public bucket.</p>
      </li>
    </ol>
  </div>

  <div class="actions">
    <a
      href={`${workerUrl}/openapi`}
      target="_blank"
      rel="noopener"
      class="secondary-btn"
    >
      View API Docs
    </a>
    <button class="primary-btn" onclick={handleNewDeployment}>
      Deploy Another Gateway
    </button>
  </div>
</div>

<style>
  .success-step {
    background: var(--surface-1);
    border: 1px solid var(--border-muted);
    border-radius: var(--radius-lg);
    padding: var(--space-2xl);
  }

  .success-header {
    text-align: center;
    margin-bottom: var(--space-2xl);
  }

  .success-icon {
    width: 64px;
    height: 64px;
    margin: 0 auto var(--space-lg);
    color: var(--color-success);
  }

  .success-icon svg {
    width: 100%;
    height: 100%;
  }

  h2 {
    font-size: var(--font-size-xl);
    margin-bottom: var(--space-sm);
  }

  h3 {
    font-size: var(--font-size-lg);
    margin-bottom: var(--space-md);
  }

  .description {
    color: var(--color-text-muted);
  }

  .info-section {
    background: var(--surface-2);
    border-radius: var(--radius-md);
    padding: var(--space-xl);
    margin-bottom: var(--space-xl);
  }

  .section-desc {
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
    margin-bottom: var(--space-md);
  }

  .url-box {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    background: var(--surface-1);
    border: 1px solid var(--border-muted);
    border-radius: var(--radius-md);
    padding: var(--space-md) var(--space-lg);
  }

  .url-box code {
    flex: 1;
    font-family: 'JetBrains Mono', monospace;
    font-size: var(--font-size-sm);
    color: var(--color-primary);
    word-break: break-all;
  }

  .url-box code.masked {
    color: var(--color-text-muted);
  }

  .copy-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .copy-btn:hover {
    background: var(--surface-3);
    color: var(--color-text);
  }

  .copy-btn svg {
    width: 16px;
    height: 16px;
  }

  .test-section {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    margin-top: var(--space-lg);
  }

  .test-result {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: var(--font-size-sm);
  }

  .test-result svg {
    width: 16px;
    height: 16px;
  }

  .test-result.success {
    color: var(--color-success);
  }

  .test-result.error {
    color: var(--color-error);
  }

  .next-steps {
    margin-bottom: var(--space-2xl);
  }

  .steps-list {
    list-style: none;
    padding: 0;
    margin: 0;
    counter-reset: step;
  }

  .steps-list li {
    position: relative;
    padding-left: 40px;
    margin-bottom: var(--space-lg);
    counter-increment: step;
  }

  .steps-list li::before {
    content: counter(step);
    position: absolute;
    left: 0;
    top: 0;
    width: 24px;
    height: 24px;
    background: var(--color-primary-light);
    color: var(--color-primary);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-xs);
    font-weight: 600;
  }

  .steps-list strong {
    display: block;
    color: var(--color-white);
    margin-bottom: var(--space-xs);
  }

  .steps-list p {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
    margin: 0;
  }

  .steps-list code {
    background: var(--surface-2);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-md);
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
    text-decoration: none;
  }

  .primary-btn {
    background: var(--color-primary);
    color: white;
    border: none;
  }

  .primary-btn:hover {
    background: var(--color-primary-hover);
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

  .secondary-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid transparent;
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>

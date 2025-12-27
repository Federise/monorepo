<script lang="ts">
  import { onMount } from 'svelte';
  import CtaButton from './CtaButton.svelte';
  import { createGatewayClient, withAuth } from '../api/client';

  const STORAGE_KEY_API = 'federise:gateway:apiKey';
  const STORAGE_KEY_URL = 'federise:gateway:url';

  let bootstrapToken = $state('');
  let workerUrl = $state('');
  let gatewayApiKey = $state('');
  let connectionStatus = $state<'idle' | 'activating' | 'success' | 'error'>('idle');
  let connectionMessage = $state('');
  let copyClicked = $state(false);
  let deployCompleted = $state(false);

  function generateToken() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  onMount(async () => {
    bootstrapToken = generateToken();

    // Load saved gateway config
    const savedKey = localStorage.getItem(STORAGE_KEY_API);
    const savedUrl = localStorage.getItem(STORAGE_KEY_URL);
    if (savedKey && savedUrl) {
      gatewayApiKey = savedKey;
      workerUrl = savedUrl;
      await checkGatewayStatus();
    }
  });

  async function checkGatewayStatus() {
    if (!workerUrl.trim() || !gatewayApiKey) return;

    try {
      const client = createGatewayClient(workerUrl);
      const { data } = await client.GET('/ping', withAuth(gatewayApiKey));

      if (data?.message === 'pong') {
        connectionStatus = 'success';
        connectionMessage = 'Gateway is active';
      }
    } catch (error) {
      console.error('Gateway status check failed:', error);
    }
  }

  function copyToken() {
    navigator.clipboard.writeText(bootstrapToken);
    copyClicked = true;
  }

  function openDeployPopup(e: MouseEvent) {
    e.preventDefault();
    const url = 'https://deploy.workers.cloudflare.com/?url=https://github.com/Federise/deploy';

    window.open(
      url,
      'Deploy to Cloudflare',
      'width=900,height=700,popup=yes,resizable=yes,scrollbars=yes'
    );
    deployCompleted = true;
  }

  async function handleActivateGateway() {
    if (!workerUrl.trim()) {
      connectionMessage = 'Please enter a worker URL';
      connectionStatus = 'error';
      return;
    }

    connectionStatus = 'activating';
    connectionMessage = 'Activating gateway...';

    try {
      const client = createGatewayClient(workerUrl);

      // Create principal with bootstrap token
      const { data, error } = await client.POST('/principal/create', {
        ...withAuth(bootstrapToken),
        body: { display_name: 'Federise Gateway' },
      });

      if (error || !data) {
        connectionStatus = 'error';
        connectionMessage = error?.message || 'Failed to create principal';
        return;
      }

      gatewayApiKey = data.secret;
      localStorage.setItem(STORAGE_KEY_API, gatewayApiKey);
      localStorage.setItem(STORAGE_KEY_URL, workerUrl);

      connectionStatus = 'success';
      connectionMessage = 'Gateway activated successfully!';

      // Auto-redirect to management
      setTimeout(() => {
        window.location.href = '/manage/connection';
      }, 1500);
    } catch (error) {
      connectionStatus = 'error';
      connectionMessage = error instanceof Error ? error.message : 'Activation failed';
    }
  }
</script>

<div class="deploy-flow">
  <div class="flow-section">
    <h3>Step 1: Copy Your Bootstrap Token</h3>
    <p>This token will authenticate your worker. You'll need to paste it into the Cloudflare template.</p>
    <div class="token-container">
      <input type="text" readonly value={bootstrapToken} class="token-input" />
      <button
        onclick={copyToken}
        disabled={copyClicked}
        class="copy-button"
        class:greyed-out={copyClicked}>
        {copyClicked ? 'Copied ✓' : 'Copy'}
      </button>
    </div>
  </div>

  <div class="flow-section">
    <h3>Step 2: Deploy to Cloudflare</h3>
    <p>Click the button below to deploy your worker. Paste the bootstrap token when prompted.</p>
    <button
      onclick={openDeployPopup}
      disabled={deployCompleted}
      class="deploy-button"
      class:greyed-out={deployCompleted}>
      <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" />
    </button>
    {#if deployCompleted}
      <div class="connection-status success" style="margin-top: 1rem;">
        ✓ Deployed successfully!
      </div>
    {/if}
  </div>

  <div class="flow-section">
    <h3>Step 3: Activate Gateway</h3>
    <p>After deployment, paste your worker URL below to activate your gateway.</p>
    <div class="url-container">
      <input
        type="url"
        bind:value={workerUrl}
        placeholder="https://your-worker.workers.dev"
        class="url-input"
      />
      <button onclick={handleActivateGateway} class="test-button" disabled={connectionStatus === 'success'}>
        {connectionStatus === 'success' ? 'Activated' : 'Activate Gateway'}
      </button>
    </div>
    {#if connectionStatus !== 'idle'}
      <div class="connection-status {connectionStatus}">
        {connectionMessage}
      </div>
    {/if}
  </div>
</div>

<style>
  .deploy-flow {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    max-width: 600px;
    margin: 2rem auto;
  }

  .flow-section {
    padding: 2rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 16px;
  }

  .flow-section h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.25rem;
    color: #fff;
  }

  .flow-section p {
    margin: 0 0 1rem 0;
    color: #a0a0a0;
    font-size: 0.9rem;
  }

  .token-container,
  .url-container {
    display: flex;
    gap: 0.5rem;
  }

  .token-input,
  .url-input {
    flex: 1;
    padding: 0.75rem 1rem;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: #fff;
    font-family: 'Courier New', monospace;
    font-size: 0.85rem;
  }

  .token-input:focus,
  .url-input:focus {
    outline: none;
    border-color: rgba(139, 92, 246, 0.5);
  }

  .copy-button,
  .test-button {
    padding: 0.75rem 1.5rem;
    background: rgba(139, 92, 246, 0.2);
    border: 1px solid rgba(139, 92, 246, 0.3);
    border-radius: 8px;
    color: #fff;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .copy-button:hover,
  .test-button:hover {
    background: rgba(139, 92, 246, 0.3);
    border-color: rgba(139, 92, 246, 0.5);
  }

  .greyed-out {
    opacity: 0.5;
    cursor: not-allowed !important;
  }

  .greyed-out:hover {
    background: rgba(139, 92, 246, 0.2) !important;
    border-color: rgba(139, 92, 246, 0.3) !important;
    transform: none !important;
  }

  .test-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .test-button:disabled:hover {
    background: rgba(139, 92, 246, 0.2);
    border-color: rgba(139, 92, 246, 0.3);
  }

  .deploy-button {
    display: inline-block;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    transition: transform 0.2s;
  }

  .deploy-button:hover {
    transform: scale(1.05);
  }

  .deploy-button img {
    display: block;
  }

  .connection-status {
    margin-top: 1rem;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    font-size: 0.9rem;
  }

  .connection-status.activating {
    background: rgba(139, 92, 246, 0.2);
    border: 1px solid rgba(139, 92, 246, 0.3);
    color: #a78bfa;
  }

  .connection-status.success {
    background: rgba(34, 197, 94, 0.2);
    border: 1px solid rgba(34, 197, 94, 0.3);
    color: #4ade80;
  }

  .connection-status.error {
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #f87171;
  }
</style>

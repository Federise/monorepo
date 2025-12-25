<script lang="ts">
  import { onMount } from 'svelte';
  import CtaButton from './CtaButton.svelte';

  let installed = $state(false);
  let bootstrapToken = $state('');
  let workerUrl = $state('');
  let gatewayApiKey = $state('');
  let connectionStatus = $state<'idle' | 'activating' | 'success' | 'error'>('idle');
  let connectionMessage = $state('');

  const GATEWAY_API_KEY_STORAGE = 'federise:gateway:apiKey';

  function generateToken() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function handleInstall() {
    try {
      await navigator.serviceWorker.register('/sw.js');
      installed = true;
    } catch (error) {
      console.error('Failed to install service worker:', error);
    }
  }

  onMount(async () => {
    bootstrapToken = generateToken();
    // Load saved gateway API key if it exists
    const savedKey = localStorage.getItem(GATEWAY_API_KEY_STORAGE);
    if (savedKey) {
      gatewayApiKey = savedKey;

      // If we have a saved key and worker URL, check if it's still valid
      const savedUrl = localStorage.getItem('federise:gateway:url');
      if (savedUrl) {
        workerUrl = savedUrl;
        await checkGatewayStatus();
      }
    }
  });

  async function checkGatewayStatus() {
    if (!workerUrl.trim() || !gatewayApiKey) return;

    try {
      const url = new URL(workerUrl);
      const pingUrl = new URL('/ping', url);
      const pingResponse = await fetch(pingUrl.href, {
        method: 'GET',
        headers: {
          'Authorization': `ApiKey ${gatewayApiKey}`
        }
      });

      if (pingResponse.ok) {
        const data = await pingResponse.json();
        if ((data as any).message === 'pong') {
          connectionStatus = 'success';
          connectionMessage = 'Gateway is active';
        }
      }
    } catch (error) {
      // Silently fail on mount check
      console.error('Gateway status check failed:', error);
    }
  }

  function copyToken() {
    navigator.clipboard.writeText(bootstrapToken);
  }

  function openDeployPopup(e: MouseEvent) {
    e.preventDefault();
    const url = 'https://deploy.workers.cloudflare.com/?url=https://github.com/Federise/deploy';

    const width = 900;
    const height = 700;

    window.open(
      url,
      'Deploy to Cloudflare',
      `width=${width},height=${height},popup=yes,resizable=yes,scrollbars=yes`
    );
  }

  async function activateGateway() {
    if (!workerUrl.trim()) {
      connectionMessage = 'Please enter a worker URL';
      connectionStatus = 'error';
      return;
    }

    connectionStatus = 'activating';
    connectionMessage = 'Activating gateway...';

    try {
      const url = new URL(workerUrl);

      // Create a principal using the bootstrap token
      const createUrl = new URL('/principal/create', url);
      const createResponse = await fetch(createUrl.href, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `ApiKey ${bootstrapToken}`
        },
        body: JSON.stringify({
          display_name: 'Federise Gateway'
        })
      });

      if (!createResponse.ok) {
        const error = await createResponse.json();
        connectionStatus = 'error';
        connectionMessage = `Failed to create principal: ${(error as any).message || createResponse.statusText}`;
        return;
      }

      const principal = await createResponse.json();
      gatewayApiKey = (principal as any).secret;

      // Save the API key and worker URL to localStorage
      localStorage.setItem(GATEWAY_API_KEY_STORAGE, gatewayApiKey);
      localStorage.setItem('federise:gateway:url', workerUrl);

      // Test the connection with the new API key
      const pingUrl = new URL('/ping', url);
      const pingResponse = await fetch(pingUrl.href, {
        method: 'GET',
        headers: {
          'Authorization': `ApiKey ${gatewayApiKey}`
        }
      });

      if (pingResponse.ok) {
        const data = await pingResponse.json();
        if ((data as any).message === 'pong') {
          connectionStatus = 'success';
          connectionMessage = 'Gateway activated successfully!';
        } else {
          connectionStatus = 'error';
          connectionMessage = 'Unexpected response from ping endpoint';
        }
      } else {
        connectionStatus = 'error';
        connectionMessage = `Ping failed: ${pingResponse.status} ${pingResponse.statusText}`;
      }
    } catch (error) {
      connectionStatus = 'error';
      connectionMessage = error instanceof Error ? error.message : 'Activation failed';
    }
  }
</script>

<div class="deploy-flow">
  <div class="flow-section">
    <h3>Step 1: Install Federise</h3>
    <p>Install the Federise service worker to enable federated capabilities.</p>
    {#if installed}
      <div class="connection-status success">
        ✓ Federise installed successfully!
      </div>
    {:else}
      <CtaButton buttonText="Install Federise" onClick={handleInstall} />
    {/if}
  </div>

  <div class="flow-section">
    <h3>Step 2: Copy Your Bootstrap Token</h3>
    <p>This token will authenticate your worker. You'll need to paste it into the Cloudflare template.</p>
    <div class="token-container">
      <input type="text" readonly value={bootstrapToken} class="token-input" />
      <button onclick={copyToken} class="copy-button">Copy</button>
    </div>
  </div>

  <div class="flow-section">
    <h3>Step 3: Deploy to Cloudflare</h3>
    <p>Click the button below to deploy your worker. Paste the bootstrap token when prompted.</p>
    <button onclick={openDeployPopup} class="deploy-button">
      <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" />
    </button>
  </div>

  <div class="flow-section">
    <h3>Step 4: Activate Gateway</h3>
    <p>After deployment, paste your worker URL below to activate your gateway.</p>
    <div class="url-container">
      <input
        type="url"
        bind:value={workerUrl}
        placeholder="https://your-worker.workers.dev"
        class="url-input"
      />
      <button onclick={activateGateway} class="test-button" disabled={connectionStatus === 'success'}>
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

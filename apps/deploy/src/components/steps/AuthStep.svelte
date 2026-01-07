<script lang="ts">
  import { deploymentStore } from '../../lib/stores/deployment.svelte.js';
  import { webcontainerStore } from '../../lib/stores/webcontainer.svelte.js';
  import { terminalStore } from '../terminal/TerminalStore.svelte.js';
  import { bootWebContainer } from '../../lib/webcontainer/boot.js';
  import {
    runNpmInstall,
    runWranglerLogin,
    runWranglerWhoami
  } from '../../lib/webcontainer/commands.js';
  import { parseWhoamiOutput } from '../../lib/webcontainer/output-parser.js';
  import StatusBadge from '../ui/StatusBadge.svelte';

  type AuthMethod = 'oauth' | 'token';

  let authMethod = $state<AuthMethod>('oauth');
  let apiToken = $state('');
  let isBooting = $state(false);
  let isAuthenticating = $state(false);
  let isValidating = $state(false);
  let bootError = $state<string | null>(null);
  let authError = $state<string | null>(null);
  let installComplete = $state(false);

  async function handleBoot() {
    isBooting = true;
    bootError = null;

    try {
      await bootWebContainer();

      if (terminalStore.terminal) {
        terminalStore.writeLine('');
        terminalStore.writeLine('\x1b[32m✓ WebContainer ready\x1b[0m');
        terminalStore.writeLine('');
        terminalStore.writeLine('\x1b[90mInstalling wrangler...\x1b[0m');
      }

      // Install dependencies
      const container = webcontainerStore.instance!;
      const result = await runNpmInstall(container, terminalStore.terminal ?? undefined);

      if (result.exitCode === 0) {
        installComplete = true;
        if (terminalStore.terminal) {
          terminalStore.writeLine('');
          terminalStore.writeLine('\x1b[32m✓ Dependencies installed\x1b[0m');
        }
      } else {
        throw new Error('Failed to install dependencies');
      }
    } catch (e) {
      bootError = e instanceof Error ? e.message : 'Failed to boot';
      if (terminalStore.terminal) {
        terminalStore.writeLine('');
        terminalStore.writeLine(`\x1b[31m✗ Error: ${bootError}\x1b[0m`);
      }
    } finally {
      isBooting = false;
    }
  }

  async function handleOAuthLogin() {
    if (!webcontainerStore.instance || !terminalStore.terminal) return;

    isAuthenticating = true;
    authError = null;

    try {
      terminalStore.writeLine('');
      terminalStore.writeLine('\x1b[90mStarting wrangler login...\x1b[0m');
      terminalStore.writeLine('\x1b[33mNote: A browser window will open for authentication.\x1b[0m');
      terminalStore.writeLine('');

      const result = await runWranglerLogin(webcontainerStore.instance, terminalStore.terminal);

      if (result.exitCode === 0) {
        await validateAuth();
      } else {
        authError = 'OAuth login failed or was cancelled';
      }
    } catch (e) {
      authError = e instanceof Error ? e.message : 'Authentication failed';
    } finally {
      isAuthenticating = false;
    }
  }

  async function handleTokenAuth() {
    if (!webcontainerStore.instance || !apiToken.trim()) return;

    isAuthenticating = true;
    authError = null;

    try {
      // Write token to environment file
      await webcontainerStore.instance.fs.writeFile(
        '.wrangler/config/default.toml',
        `oauth_token = "${apiToken.trim()}"`
      );

      if (terminalStore.terminal) {
        terminalStore.writeLine('');
        terminalStore.writeLine('\x1b[90mAPI token configured, validating...\x1b[0m');
      }

      await validateAuth();
    } catch (e) {
      authError = e instanceof Error ? e.message : 'Token authentication failed';
    } finally {
      isAuthenticating = false;
    }
  }

  async function validateAuth() {
    if (!webcontainerStore.instance) return;

    isValidating = true;

    try {
      const result = await runWranglerWhoami(
        webcontainerStore.instance,
        terminalStore.terminal ?? undefined
      );

      if (result.exitCode === 0) {
        const info = parseWhoamiOutput(result.stdout);
        if (info) {
          deploymentStore.setAuthenticated(info.accountId, info.email);
          if (terminalStore.terminal) {
            terminalStore.writeLine('');
            terminalStore.writeLine(`\x1b[32m✓ Authenticated as ${info.email}\x1b[0m`);
          }
          deploymentStore.setStep('config');
        } else {
          authError = 'Could not parse account information';
        }
      } else {
        authError = 'Not authenticated. Please try again.';
      }
    } catch (e) {
      authError = e instanceof Error ? e.message : 'Validation failed';
    } finally {
      isValidating = false;
    }
  }
</script>

<div class="auth-step">
  <h2>Authenticate with Cloudflare</h2>
  <p class="description">
    Connect your Cloudflare account to deploy the gateway. You can use OAuth login or paste an API token.
  </p>

  {#if !webcontainerStore.isReady}
    <div class="boot-section">
      <p class="info">
        First, we need to initialize the deployment environment. This runs a lightweight container in your browser.
      </p>

      {#if bootError}
        <div class="error-message">
          <strong>Error:</strong> {bootError}
        </div>
      {/if}

      <button
        class="primary-btn"
        onclick={handleBoot}
        disabled={isBooting}
      >
        {#if isBooting}
          <span class="spinner"></span>
          Initializing...
        {:else}
          Initialize Environment
        {/if}
      </button>
    </div>
  {:else if !installComplete}
    <div class="status-section">
      <StatusBadge status="running" label="Installing dependencies..." />
    </div>
  {:else}
    <div class="auth-options">
      <div class="method-tabs">
        <button
          class="tab"
          class:active={authMethod === 'oauth'}
          onclick={() => (authMethod = 'oauth')}
        >
          OAuth Login
        </button>
        <button
          class="tab"
          class:active={authMethod === 'token'}
          onclick={() => (authMethod = 'token')}
        >
          API Token
        </button>
      </div>

      {#if authMethod === 'oauth'}
        <div class="method-content">
          <p>Click below to authenticate with Cloudflare using OAuth. A browser window will open.</p>

          <button
            class="primary-btn cloudflare"
            onclick={handleOAuthLogin}
            disabled={isAuthenticating || isValidating}
          >
            {#if isAuthenticating}
              <span class="spinner"></span>
              Authenticating...
            {:else}
              <svg class="cf-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16.5088 16.8447c.1475-.5068.0908-.9707-.1553-1.3154-.2246-.3164-.5765-.5-.9658-.5069l-8.3516-.1113c-.0537-.0019-.0752-.0235-.0859-.0391-.0108-.0136-.0264-.0411-.0195-.0782.0088-.0449.0508-.0781.1006-.0801l8.5742-.1162c.751-.0225 1.5615-.5996 1.873-1.3379l.3955-1.0938c.0195-.0537.0264-.1074.0215-.1641a4.2882 4.2882 0 0 0-4.2568-3.9033c-1.9688 0-3.6464 1.3066-4.1875 3.1025-.4355-.3262-1.0156-.4902-1.627-.4307-.8897.0879-1.6288.7178-1.841 1.5693-.052.2051-.0774.4121-.078.6133-1.5654.0293-2.7568 1.2764-2.7568 2.856 0 .1465.0146.293.0273.4375.0107.0957.0948.166.1894.1699l17.8623.1543c.0528.0001.0939-.0193.1143-.0466.0205-.0274.0245-.0599.0129-.0951z"/>
              </svg>
              Sign in with Cloudflare
            {/if}
          </button>
        </div>
      {:else}
        <div class="method-content">
          <p>
            Create an API token at{' '}
            <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener">
              dash.cloudflare.com/profile/api-tokens
            </a>
            {' '}with these permissions:
          </p>
          <ul class="permissions">
            <li>Account: Workers Scripts - Edit</li>
            <li>Account: Workers KV Storage - Edit</li>
            <li>Account: Workers R2 Storage - Edit</li>
          </ul>

          <div class="token-input">
            <input
              type="password"
              bind:value={apiToken}
              placeholder="Paste your API token"
              class="input"
            />
            <button
              class="primary-btn"
              onclick={handleTokenAuth}
              disabled={!apiToken.trim() || isAuthenticating || isValidating}
            >
              {#if isAuthenticating || isValidating}
                <span class="spinner"></span>
                Validating...
              {:else}
                Continue
              {/if}
            </button>
          </div>
        </div>
      {/if}

      {#if authError}
        <div class="error-message">
          {authError}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .auth-step {
    background: var(--surface-1);
    border: 1px solid var(--border-muted);
    border-radius: var(--radius-lg);
    padding: var(--space-2xl);
  }

  h2 {
    font-size: var(--font-size-xl);
    margin-bottom: var(--space-sm);
  }

  .description {
    color: var(--color-text-muted);
    margin-bottom: var(--space-xl);
  }

  .boot-section, .status-section {
    text-align: center;
    padding: var(--space-xl) 0;
  }

  .info {
    color: var(--color-text-muted);
    margin-bottom: var(--space-xl);
    max-width: 500px;
    margin-left: auto;
    margin-right: auto;
  }

  .method-tabs {
    display: flex;
    border-bottom: 1px solid var(--border-muted);
    margin-bottom: var(--space-xl);
  }

  .tab {
    flex: 1;
    padding: var(--space-md) var(--space-lg);
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--color-text-muted);
    font-size: var(--font-size-base);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .tab:hover {
    color: var(--color-text);
  }

  .tab.active {
    color: var(--color-primary);
    border-bottom-color: var(--color-primary);
  }

  .method-content {
    padding: var(--space-lg) 0;
  }

  .method-content p {
    margin-bottom: var(--space-lg);
  }

  .method-content a {
    color: var(--color-primary);
    text-decoration: none;
  }

  .method-content a:hover {
    text-decoration: underline;
  }

  .permissions {
    background: var(--surface-2);
    border-radius: var(--radius-md);
    padding: var(--space-lg) var(--space-xl);
    margin: var(--space-lg) 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
  }

  .permissions li {
    margin-bottom: var(--space-sm);
  }

  .permissions li:last-child {
    margin-bottom: 0;
  }

  .token-input {
    display: flex;
    gap: var(--space-md);
  }

  .input {
    flex: 1;
    padding: var(--space-md) var(--space-lg);
    background: var(--surface-2);
    border: 1px solid var(--border-muted);
    border-radius: var(--radius-md);
    color: var(--color-text);
    font-size: var(--font-size-base);
    font-family: 'JetBrains Mono', monospace;
    outline: none;
    transition: border-color var(--transition-fast);
  }

  .input:focus {
    border-color: var(--color-primary);
  }

  .primary-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-xl);
    background: var(--color-primary);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .primary-btn:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .primary-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .primary-btn.cloudflare {
    background: var(--color-cloudflare);
  }

  .primary-btn.cloudflare:hover:not(:disabled) {
    background: var(--color-cloudflare-hover);
  }

  .cf-icon {
    width: 20px;
    height: 20px;
  }

  .spinner {
    width: 16px;
    height: 16px;
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

  .error-message {
    background: var(--color-error-bg);
    color: var(--color-error);
    padding: var(--space-md) var(--space-lg);
    border-radius: var(--radius-md);
    margin-top: var(--space-lg);
    font-size: var(--font-size-sm);
  }
</style>

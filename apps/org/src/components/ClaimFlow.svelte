<script lang="ts">
  import { onMount } from 'svelte';

  // Flow states
  type FlowState = 'loading' | 'setup' | 'claiming' | 'success' | 'error';

  // Token lookup result from gateway
  interface TokenInfo {
    valid: boolean;
    action?: string;
    payload?: {
      identityId: string;
      displayName?: string;
    };
    error?: string;
  }

  // Claim result from gateway
  interface ClaimResult {
    identity: {
      id: string;
      displayName: string;
    };
    credential: {
      id: string;
    };
    secret: string;
  }

  let state = $state<FlowState>('loading');
  let token = $state('');
  let gatewayUrl = $state('');
  let tokenInfo = $state<TokenInfo | null>(null);
  let password = $state('');
  let confirmPassword = $state('');
  let claimResult = $state<ClaimResult | null>(null);
  let error = $state('');
  let copied = $state(false);

  onMount(async () => {
    // Parse hash format: #<tokenId>@<base64urlGatewayUrl>
    const hash = window.location.hash.slice(1);
    let tokenParam: string | null = null;
    let gatewayParam: string | null = null;

    if (hash && hash.includes('@')) {
      const atIndex = hash.lastIndexOf('@');
      tokenParam = hash.slice(0, atIndex);
      const base64Gateway = hash.slice(atIndex + 1);
      // Decode base64url: restore standard base64 chars and add padding
      const base64 = base64Gateway
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(base64Gateway.length + (4 - base64Gateway.length % 4) % 4, '=');
      try {
        gatewayParam = atob(base64);
      } catch {
        // Invalid base64, fall through to error
      }
    }

    // Fallback to query params for backwards compatibility
    if (!tokenParam) {
      const params = new URLSearchParams(window.location.search);
      tokenParam = params.get('token');
      gatewayParam = params.get('gateway');
    }

    if (!tokenParam) {
      error = 'Missing token parameter';
      state = 'error';
      return;
    }

    token = tokenParam;

    // Gateway URL can come from param or from localStorage
    gatewayUrl = gatewayParam ||
      localStorage.getItem('federise:gateway:url') ||
      '';

    if (!gatewayUrl) {
      error = 'No gateway URL configured';
      state = 'error';
      return;
    }

    // Look up token info
    try {
      const response = await fetch(`${gatewayUrl}/token/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenId: token }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        error = data.message || `Failed to look up token: HTTP ${response.status}`;
        state = 'error';
        return;
      }

      const info = await response.json() as TokenInfo;

      if (!info.valid) {
        error = info.error || 'Token is invalid or expired';
        state = 'error';
        return;
      }

      if (info.action !== 'identity:claim') {
        error = `Unexpected token action: ${info.action}`;
        state = 'error';
        return;
      }

      tokenInfo = info;
      state = 'setup';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to validate token';
      state = 'error';
    }
  });

  function validateForm(): string | null {
    if (password.length < 8) {
      return 'Password must be at least 8 characters';
    }
    if (password !== confirmPassword) {
      return 'Passwords do not match';
    }
    return null;
  }

  async function handleClaim(): Promise<void> {
    const validationError = validateForm();
    if (validationError) {
      error = validationError;
      return;
    }

    state = 'claiming';
    error = '';

    try {
      const response = await fetch(`${gatewayUrl}/token/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenId: token,
          password,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        error = data.message || `Claim failed: HTTP ${response.status}`;
        state = 'setup';
        return;
      }

      claimResult = await response.json();
      state = 'success';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to claim identity';
      state = 'setup';
    }
  }

  async function copyApiKey(): Promise<void> {
    if (!claimResult?.secret) return;

    try {
      await navigator.clipboard.writeText(claimResult.secret);
      copied = true;
      setTimeout(() => { copied = false; }, 2000);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  }

  function handleClose(): void {
    window.close();
  }
</script>

<div class="claim-container">
  {#if state === 'loading'}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Validating token...</p>
    </div>
  {:else if state === 'error'}
    <div class="error-state">
      <div class="error-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M15 9l-6 6" />
          <path d="M9 9l6 6" />
        </svg>
      </div>
      <h2>Unable to Proceed</h2>
      <p>{error}</p>
      <button class="btn btn-secondary" onclick={handleClose}>Close</button>
    </div>
  {:else if state === 'setup' || state === 'claiming'}
    <div class="header">
      <div class="logo">
        <span class="logo-icon">F</span>
      </div>
      <h1>Set Up Your Account</h1>
    </div>

    <div class="identity-info">
      <p class="welcome-text">You've been invited to join as:</p>
      <span class="identity-name">{tokenInfo?.payload?.displayName || 'New User'}</span>
    </div>

    <form class="setup-form" onsubmit={(e) => { e.preventDefault(); handleClaim(); }}>
      <div class="form-group">
        <label for="password">Password</label>
        <input
          type="password"
          id="password"
          bind:value={password}
          placeholder="Create a password"
          minlength="8"
          required
          disabled={state === 'claiming'}
        />
        <span class="hint">At least 8 characters</span>
      </div>

      <div class="form-group">
        <label for="confirmPassword">Confirm Password</label>
        <input
          type="password"
          id="confirmPassword"
          bind:value={confirmPassword}
          placeholder="Confirm your password"
          required
          disabled={state === 'claiming'}
        />
      </div>

      {#if error}
        <div class="form-error">{error}</div>
      {/if}

      <div class="actions">
        <button class="btn btn-secondary" type="button" onclick={handleClose} disabled={state === 'claiming'}>
          Cancel
        </button>
        <button class="btn btn-primary" type="submit" disabled={state === 'claiming'}>
          {state === 'claiming' ? 'Creating Account...' : 'Create Account'}
        </button>
      </div>
    </form>
  {:else if state === 'success'}
    <div class="success-state">
      <div class="success-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      </div>
      <h2>Account Created!</h2>
      <p class="identity-display">Welcome, <strong>{claimResult?.identity.displayName}</strong></p>

      <div class="api-key-section">
        <p class="api-key-warning">
          Save your API key now - it won't be shown again!
        </p>
        <div class="api-key-container">
          <code class="api-key">{claimResult?.secret}</code>
          <button class="copy-btn" onclick={copyApiKey} title="Copy to clipboard">
            {#if copied}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            {:else}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            {/if}
          </button>
        </div>
      </div>

      <button class="btn btn-primary done-btn" onclick={handleClose}>
        Done
      </button>
    </div>
  {/if}
</div>

<style>
  :root {
    background: rgba(20, 20, 20, 0.9);
  }

  .claim-container {
    background: rgba(20, 20, 20, 0.9);
    border: 1px solid var(--border-normal);
    border-radius: var(--radius-xl);
    padding: var(--space-2xl);
    max-width: 420px;
    width: 100%;
    backdrop-filter: blur(10px);
  }

  /* Loading state */
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--space-2xl) 0;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border-normal);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .loading-state p {
    margin-top: var(--space-lg);
    color: var(--color-text-subtle);
  }

  /* Error state */
  .error-state {
    text-align: center;
  }

  .error-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 72px;
    height: 72px;
    background: rgba(239, 68, 68, 0.1);
    border-radius: 50%;
    color: var(--color-error);
    margin-bottom: var(--space-lg);
  }

  .error-state h2 {
    color: var(--color-error);
    margin-bottom: var(--space-sm);
  }

  .error-state p {
    color: var(--color-text);
    margin-bottom: var(--space-xl);
  }

  /* Success state */
  .success-state {
    text-align: center;
  }

  .success-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 72px;
    height: 72px;
    background: rgba(34, 197, 94, 0.1);
    border-radius: 50%;
    color: #22c55e;
    margin-bottom: var(--space-lg);
  }

  .success-state h2 {
    color: var(--color-white);
    margin-bottom: var(--space-sm);
  }

  .identity-display {
    color: var(--color-text);
    margin-bottom: var(--space-xl);
  }

  .api-key-section {
    background: var(--surface-darker);
    border-radius: var(--radius-md);
    padding: var(--space-lg);
    margin-bottom: var(--space-xl);
  }

  .api-key-warning {
    color: var(--color-warning);
    font-size: var(--font-size-sm);
    margin-bottom: var(--space-md);
  }

  .api-key-container {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    background: var(--surface-3);
    border-radius: var(--radius-md);
    padding: var(--space-sm) var(--space-md);
  }

  .api-key {
    flex: 1;
    font-family: monospace;
    font-size: var(--font-size-sm);
    color: var(--color-white);
    word-break: break-all;
  }

  .copy-btn {
    background: transparent;
    border: none;
    color: var(--color-text-subtle);
    cursor: pointer;
    padding: var(--space-sm);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition-base);
  }

  .copy-btn:hover {
    background: var(--surface-darker);
    color: var(--color-white);
  }

  .done-btn {
    width: 100%;
  }

  /* Header */
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

  /* Identity info */
  .identity-info {
    text-align: center;
    margin-bottom: var(--space-xl);
  }

  .welcome-text {
    color: var(--color-text);
    margin-bottom: var(--space-sm);
  }

  .identity-name {
    display: inline-block;
    padding: var(--space-sm) var(--space-lg);
    background: var(--color-primary-light);
    border-radius: var(--radius-md);
    font-weight: 600;
    color: #a78bfa;
    font-size: var(--font-size-lg);
  }

  /* Form */
  .setup-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .form-group label {
    font-size: var(--font-size-sm);
    color: var(--color-text);
    font-weight: 500;
  }

  .form-group input {
    padding: var(--space-md);
    background: var(--surface-darker);
    border: 1px solid var(--border-normal);
    border-radius: var(--radius-md);
    color: var(--color-white);
    font-size: var(--font-size-md);
    font-family: inherit;
    transition: border-color var(--transition-base);
  }

  .form-group input:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .form-group input:disabled {
    opacity: 0.6;
  }

  .hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-subtle);
  }

  .form-error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: var(--radius-md);
    padding: var(--space-sm) var(--space-md);
    color: var(--color-error);
    font-size: var(--font-size-sm);
  }

  /* Actions */
  .actions {
    display: flex;
    gap: var(--space-md);
    margin-top: var(--space-md);
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

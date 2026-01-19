<script lang="ts">
  import { onMount } from 'svelte';
  import { createVaultStorage, type VaultCapability } from '@federise/proxy';
  import { createGatewayClient } from '../api/client';

  // Flow states
  type FlowState = 'loading' | 'ready' | 'claiming' | 'success' | 'error';

  // Flow modes
  type FlowMode = 'token' | 'share';

  // Token lookup result from gateway
  interface TokenInfo {
    valid: boolean;
    action?: string;
    label?: string;
    expiresAt?: string;
    identityInfo?: {
      displayName: string;
      type: string;
    };
    error?: string;
  }

  // Grant info from claim response
  interface GrantInfo {
    grantId: string;
    capability: string;
    resourceType?: string;
    resourceId?: string;
  }

  // Claim result from gateway
  interface ClaimResult {
    success: boolean;
    identity?: {
      id: string;
      type: string;
      displayName: string;
      status: string;
    };
    secret?: string;
    grants?: GrantInfo[];
    error?: string;
  }

  // Direct share payload (from identity manager share link)
  interface SharePayload {
    identityId: string;
    displayName: string;
    identityType: string;
    apiKey: string;
    gatewayUrl: string;
    capabilities: string[];
    returnUrl?: string;
  }

  let flowState = $state<FlowState>('loading');
  let mode = $state<FlowMode>('token');
  let token = $state('');
  let gatewayUrl = $state('');
  let returnUrl = $state<string | null>(null);
  let tokenInfo = $state<TokenInfo | null>(null);
  let sharePayload = $state<SharePayload | null>(null);
  let error = $state('');

  function decodeBase64Url(base64url: string): string | null {
    try {
      const base64 = base64url
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(base64url.length + (4 - base64url.length % 4) % 4, '=');
      return atob(base64);
    } catch {
      return null;
    }
  }

  onMount(async () => {
    // Parse hash format:
    // Token claim: #<tokenId>@<base64urlGatewayUrl>@<base64urlReturnUrl>
    // Direct share: #share@<base64urlPayload>
    const hash = window.location.hash.slice(1);

    // Check for direct share format first
    if (hash.startsWith('share@')) {
      mode = 'share';
      const payloadStr = hash.slice(6); // Remove 'share@' prefix
      const decoded = decodeBase64Url(payloadStr);

      if (!decoded) {
        error = 'Invalid share link format';
        flowState = 'error';
        return;
      }

      try {
        sharePayload = JSON.parse(decoded) as SharePayload;

        if (!sharePayload.identityId || !sharePayload.apiKey || !sharePayload.gatewayUrl) {
          error = 'Invalid share link: missing required fields';
          flowState = 'error';
          return;
        }

        gatewayUrl = sharePayload.gatewayUrl;
        flowState = 'ready';
      } catch {
        error = 'Invalid share link: could not parse data';
        flowState = 'error';
      }
      return;
    }

    // Standard token claim format
    mode = 'token';
    let tokenParam: string | null = null;
    let gatewayParam: string | null = null;
    let returnParam: string | null = null;

    if (hash && hash.includes('@')) {
      const parts = hash.split('@');
      tokenParam = parts[0] || null;
      gatewayParam = parts[1] ? decodeBase64Url(parts[1]) : null;
      returnParam = parts[2] ? decodeBase64Url(parts[2]) : null;
    }

    // Fallback to query params for backwards compatibility
    if (!tokenParam) {
      const params = new URLSearchParams(window.location.search);
      tokenParam = params.get('token');
      gatewayParam = params.get('gateway');
    }

    if (!tokenParam) {
      error = 'Missing token parameter';
      flowState = 'error';
      return;
    }

    token = tokenParam;

    // Gateway URL must come from the link
    if (!gatewayParam) {
      error = 'Missing gateway URL';
      flowState = 'error';
      return;
    }

    gatewayUrl = gatewayParam;
    returnUrl = returnParam;

    // Look up token info
    try {
      const client = createGatewayClient(gatewayUrl);
      const { data: info, error: apiError } = await client.POST('/token/lookup', {
        body: { tokenId: token },
      });

      if (apiError) {
        error = apiError.message || 'Failed to look up token';
        flowState = 'error';
        return;
      }

      if (!info) {
        error = 'No response from token lookup';
        flowState = 'error';
        return;
      }

      if (!info.valid) {
        error = info.error || 'This invitation is invalid or has expired';
        flowState = 'error';
        return;
      }

      if (info.action !== 'identity:claim') {
        error = `Unexpected token action: ${info.action}`;
        flowState = 'error';
        return;
      }

      tokenInfo = info;
      flowState = 'ready';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to validate invitation';
      flowState = 'error';
    }
  });

  async function handleAccept(): Promise<void> {
    flowState = 'claiming';
    error = '';

    try {
      const client = createGatewayClient(gatewayUrl);
      const { data: result, error: apiError } = await client.POST('/token/claim', {
        body: { tokenId: token },
      });

      if (apiError) {
        error = apiError.message || 'Failed to accept invitation';
        flowState = 'ready';
        return;
      }

      if (!result || !result.success || !result.secret || !result.identity) {
        error = 'Failed to accept invitation';
        flowState = 'ready';
        return;
      }

      // Initialize vault and add the new identity
      const vault = createVaultStorage(localStorage);

      // Convert grants to vault capabilities
      const capabilities: VaultCapability[] = (result.grants || []).map((grant) => ({
        capability: grant.capability,
        resourceType: grant.resourceType,
        resourceId: grant.resourceId,
        grantedAt: new Date().toISOString(),
      }));

      // Determine referrer from return URL if present
      let referrer: string | undefined;
      if (returnUrl) {
        try {
          referrer = new URL(returnUrl).origin;
        } catch {
          // Invalid URL, skip referrer
        }
      }

      // Add to vault (this will set isPrimary appropriately)
      vault.add({
        identityId: result.identity.id,
        displayName: result.identity.displayName,
        identityType: (result.identity.type as 'user' | 'service' | 'agent' | 'app' | 'anonymous') || 'user',
        gatewayUrl: gatewayUrl,
        apiKey: result.secret,
        source: 'granted',
        referrer,
        claimedAt: new Date().toISOString(),
        capabilities,
      });

      // Redirect to the app if we have a return URL, otherwise go to manage
      if (returnUrl) {
        window.location.href = returnUrl;
        return;
      }

      flowState = 'success';

      // Redirect to manage page after a brief delay
      setTimeout(() => {
        window.location.href = '/manage/identities';
      }, 1500);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to accept invitation';
      flowState = 'ready';
    }
  }

  function handleAcceptShare(): void {
    if (!sharePayload) {
      error = 'No share data available';
      flowState = 'error';
      return;
    }

    flowState = 'claiming';
    error = '';

    try {
      const vault = createVaultStorage(localStorage);

      // Convert capability strings to VaultCapability format
      const capabilities: VaultCapability[] = (sharePayload.capabilities || []).map((cap: string) => ({
        capability: cap,
        grantedAt: new Date().toISOString(),
      }));

      // Add to vault
      vault.add({
        identityId: sharePayload.identityId,
        displayName: sharePayload.displayName,
        identityType: (sharePayload.identityType as 'user' | 'service' | 'agent' | 'app' | 'anonymous') || 'user',
        gatewayUrl: sharePayload.gatewayUrl,
        apiKey: sharePayload.apiKey,
        source: 'granted',
        claimedAt: new Date().toISOString(),
        capabilities,
      });

      // Redirect to the app if we have a return URL, otherwise go to manage
      if (sharePayload.returnUrl) {
        window.location.href = sharePayload.returnUrl;
        return;
      }

      flowState = 'success';

      // Redirect to manage page after a brief delay
      setTimeout(() => {
        window.location.href = '/manage/identities';
      }, 1500);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to save identity';
      flowState = 'ready';
    }
  }

  function handleDecline(): void {
    // Just go back or close
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.close();
    }
  }
</script>

<div class="claim-container">
  {#if flowState === 'loading'}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Loading invitation...</p>
    </div>
  {:else if flowState === 'error'}
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
    </div>
  {:else if flowState === 'ready' || flowState === 'claiming'}
    <div class="header">
      <div class="logo">
        <span class="logo-icon">F</span>
      </div>
      <h1>{mode === 'share' ? 'Gateway Access Shared' : 'You\'ve Been Invited'}</h1>
    </div>

    <div class="invitation-info">
      {#if mode === 'share' && sharePayload}
        <p class="invite-text">You've received access to a gateway as:</p>
        <span class="identity-name">{sharePayload.displayName}</span>

        {#if sharePayload.capabilities && sharePayload.capabilities.length > 0}
          <div class="capabilities-list">
            <p class="capabilities-label">Capabilities:</p>
            <div class="capability-badges">
              {#each sharePayload.capabilities as cap}
                <span class="capability-badge">{cap}</span>
              {/each}
            </div>
          </div>
        {/if}

        <p class="gateway-info">Gateway: <code>{sharePayload.gatewayUrl}</code></p>
      {:else}
        <p class="invite-text">You're invited to join as:</p>
        <span class="identity-name">{tokenInfo?.identityInfo?.displayName || 'Unknown'}</span>

        {#if tokenInfo?.label}
          <p class="access-description">{tokenInfo.label}</p>
        {/if}
      {/if}
    </div>

    {#if error}
      <div class="form-error">{error}</div>
    {/if}

    <div class="actions">
      <button class="btn btn-secondary" type="button" onclick={handleDecline} disabled={flowState === 'claiming'}>
        Decline
      </button>
      <button class="btn btn-primary" type="button" onclick={mode === 'share' ? handleAcceptShare : handleAccept} disabled={flowState === 'claiming'}>
        {flowState === 'claiming' ? 'Adding...' : 'Add to Vault'}
      </button>
    </div>
  {:else if flowState === 'success'}
    <div class="success-state">
      <div class="success-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      </div>
      <h2>You're In!</h2>
      <p class="success-text">
        {#if mode === 'share' && sharePayload}
          You now have access as <strong>{sharePayload.displayName}</strong>.
        {:else}
          You now have access as <strong>{tokenInfo?.identityInfo?.displayName}</strong>.
        {/if}
      </p>
      <p class="success-hint">
        Redirecting to your identities...
      </p>
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

  .success-text {
    color: var(--color-text);
    margin-bottom: var(--space-sm);
  }

  .success-hint {
    color: var(--color-text-subtle);
    font-size: var(--font-size-sm);
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

  /* Invitation info */
  .invitation-info {
    text-align: center;
    margin-bottom: var(--space-xl);
  }

  .invite-text {
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

  .access-description {
    margin-top: var(--space-lg);
    color: var(--color-text-subtle);
    font-size: var(--font-size-sm);
  }

  .capabilities-list {
    margin-top: var(--space-lg);
    text-align: center;
  }

  .capabilities-label {
    color: var(--color-text-subtle);
    font-size: var(--font-size-sm);
    margin-bottom: var(--space-sm);
  }

  .capability-badges {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    justify-content: center;
  }

  .capability-badge {
    display: inline-block;
    padding: var(--space-xs) var(--space-sm);
    background: var(--surface-3);
    border: 1px solid var(--border-normal);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
    color: var(--color-text);
    font-family: var(--font-mono);
  }

  .gateway-info {
    margin-top: var(--space-lg);
    color: var(--color-text-subtle);
    font-size: var(--font-size-sm);
  }

  .gateway-info code {
    background: var(--surface-3);
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--color-text);
  }

  .form-error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: var(--radius-md);
    padding: var(--space-sm) var(--space-md);
    color: var(--color-error);
    font-size: var(--font-size-sm);
    margin-bottom: var(--space-lg);
    text-align: center;
  }

  /* Actions */
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

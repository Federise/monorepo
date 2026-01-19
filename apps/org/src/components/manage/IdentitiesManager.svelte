<script lang="ts">
  import { onMount } from 'svelte';
  import { createGatewayClient, withAuth } from '../../api/client';
  import {
    createVaultStorage,
    createVaultQueries,
  } from '@federise/proxy';
  import type { IdentityInfo, VaultSummary } from '@federise/proxy';

  const STORAGE_KEY_API = 'federise:gateway:apiKey';
  const STORAGE_KEY_URL = 'federise:gateway:url';

  interface AppConfig {
    origin: string;
    namespace: string;
    grantedCapabilities: string[];
    frameAccess: boolean;
  }

  interface Identity {
    id: string;
    type: string;
    displayName: string;
    status: string;
    createdAt: string;
    appConfig?: AppConfig;
  }

  let identities = $state<Identity[]>([]);
  let loading = $state(true);
  let showCreateForm = $state(false);
  let newIdentityName = $state('');
  let newIdentityType = $state<'user' | 'service'>('user');
  let newIdentitySecret = $state('');
  let toast = $state({ show: false, message: '', type: 'success' as 'success' | 'error' });
  let loaded = $state(false);
  let activeTab = $state<'users' | 'apps' | 'vault'>('users');

  // Vault state
  let vaultSummary = $state<VaultSummary | null>(null);
  let vaultIdentities = $state<IdentityInfo[]>([]);

  let apiKey = $state<string | null>(null);
  let gatewayUrl = $state<string | null>(null);

  // Computed: filter identities by type
  let userIdentities = $derived(
    identities.filter(i => i.type === 'user' || i.type === 'service' || i.type === 'agent')
  );
  let appIdentities = $derived(
    identities.filter(i => i.type === 'app')
  );

  async function loadIdentities() {
    if (!apiKey || !gatewayUrl) {
      loading = false;
      return;
    }

    loading = true;
    try {
      const client = createGatewayClient(gatewayUrl);
      const { data } = await client.POST('/identity/list', withAuth(apiKey));

      if (data) {
        identities = data.identities as Identity[];
      } else {
        showToast('Failed to load identities', 'error');
      }
    } catch (error) {
      console.error('Failed to load identities:', error);
      showToast('Failed to load identities', 'error');
    }
    loading = false;
  }

  async function createIdentity() {
    if (!newIdentityName.trim()) {
      showToast('Please enter a name', 'error');
      return;
    }

    if (!apiKey || !gatewayUrl) {
      showToast('No gateway configured', 'error');
      return;
    }

    try {
      const client = createGatewayClient(gatewayUrl);
      const { data, error } = await client.POST('/identity/create', {
        ...withAuth(apiKey),
        body: { displayName: newIdentityName, type: newIdentityType },
      });

      if (data) {
        newIdentitySecret = data.secret;
        showToast('Identity created!', 'success');
        await loadIdentities();
        newIdentityName = '';
      } else {
        showToast(error?.message || 'Failed to create identity', 'error');
      }
    } catch (error) {
      console.error('Failed to create identity:', error);
      showToast('Failed to create identity', 'error');
    }
  }

  async function deleteIdentity(identityId: string, displayName: string) {
    if (!confirm(`Delete "${displayName}"? This cannot be undone.`)) {
      return;
    }

    if (!apiKey || !gatewayUrl) {
      showToast('No gateway configured', 'error');
      return;
    }

    try {
      const client = createGatewayClient(gatewayUrl);
      const { error } = await client.POST('/identity/delete', {
        ...withAuth(apiKey),
        body: { identityId },
      });

      if (!error) {
        showToast('Identity deleted', 'success');
        await loadIdentities();
      } else {
        showToast(error.message || 'Failed to delete identity', 'error');
      }
    } catch (error) {
      console.error('Failed to delete identity:', error);
      showToast('Failed to delete identity', 'error');
    }
  }

  function showToast(message: string, type: 'success' | 'error') {
    toast = { show: true, message, type };
    setTimeout(() => {
      toast = { show: false, message: '', type: 'success' };
    }, 3000);
  }

  function copySecret() {
    navigator.clipboard.writeText(newIdentitySecret);
    showToast('API key copied to clipboard', 'success');
  }

  function closeSecretModal() {
    newIdentitySecret = '';
  }

  function formatCapabilities(caps: string[]): string {
    return caps.map(c => c.replace(':', ' ')).join(', ');
  }

  function loadVault() {
    try {
      const vault = createVaultStorage(localStorage);
      const queries = createVaultQueries(vault);

      // Get summary
      const summary = queries.getSummary();
      const grouped = queries.groupByGateway();

      vaultSummary = {
        totalIdentities: summary.totalIdentities,
        totalGateways: summary.totalGateways,
        ownerIdentities: summary.ownerIdentities,
        grantedIdentities: summary.grantedIdentities,
        identitiesByGateway: grouped,
      };

      // Get all vault entries as safe info
      vaultIdentities = vault.getAll().map((entry) => vault.toSafeInfo(entry));
    } catch (error) {
      console.error('Failed to load vault:', error);
      vaultSummary = null;
      vaultIdentities = [];
    }
  }

  function removeFromVault(identityId: string, displayName: string) {
    if (!confirm(`Remove "${displayName}" from your vault? This will revoke your access to resources shared with this identity.`)) {
      return;
    }

    try {
      const vault = createVaultStorage(localStorage);
      vault.remove(identityId);
      loadVault();
      showToast('Identity removed from vault', 'success');
    } catch (error) {
      console.error('Failed to remove from vault:', error);
      showToast('Failed to remove identity', 'error');
    }
  }

  function setPrimaryIdentity(identityId: string) {
    try {
      const vault = createVaultStorage(localStorage);
      vault.setPrimary(identityId);
      loadVault();
      showToast('Primary identity updated', 'success');
    } catch (error) {
      console.error('Failed to set primary:', error);
      showToast('Failed to set primary identity', 'error');
    }
  }

  onMount(async () => {
    apiKey = localStorage.getItem(STORAGE_KEY_API);
    gatewayUrl = localStorage.getItem(STORAGE_KEY_URL);
    loadVault();
    await loadIdentities();
    loaded = true;
  });
</script>

{#if loaded}
<div class="identities-manager">
  {#if !apiKey || !gatewayUrl}
    <div class="empty-state">
      <p>No gateway configured. Please set up your gateway first.</p>
      <a href="/start" class="cta-button">Go to Setup</a>
    </div>
  {:else}
    <div class="header">
      <h2>Identities</h2>
      <button onclick={() => (showCreateForm = !showCreateForm)} class="create-button">
        {showCreateForm ? 'Cancel' : '+ Create Identity'}
      </button>
    </div>

    {#if showCreateForm}
      <div class="create-form">
        <h3>Create New Identity</h3>
        <div class="form-row">
          <input
            type="text"
            bind:value={newIdentityName}
            placeholder="Display name"
            class="name-input"
          />
          <select bind:value={newIdentityType} class="type-select">
            <option value="user">User</option>
            <option value="service">Service</option>
          </select>
        </div>
        <button onclick={createIdentity} class="submit-button">Create</button>
      </div>
    {/if}

    <!-- Tabs -->
    <div class="tabs">
      <button
        class="tab"
        class:active={activeTab === 'users'}
        onclick={() => activeTab = 'users'}
      >
        Users & Services ({userIdentities.length})
      </button>
      <button
        class="tab"
        class:active={activeTab === 'apps'}
        onclick={() => activeTab = 'apps'}
      >
        Connected Apps ({appIdentities.length})
      </button>
      <button
        class="tab"
        class:active={activeTab === 'vault'}
        onclick={() => activeTab = 'vault'}
      >
        My Vault ({vaultIdentities.length})
      </button>
    </div>

    {#if loading}
      <div class="loading">Loading identities...</div>
    {:else if activeTab === 'users'}
      <!-- Users/Services tab -->
      {#if userIdentities.length === 0}
        <div class="empty-state">
          <p>No users or services yet. Create one to get started.</p>
        </div>
      {:else}
        <div class="identity-list">
          {#each userIdentities as identity}
            <div class="identity-card">
              <div class="identity-header">
                <div class="identity-info">
                  <span class="identity-name">{identity.displayName}</span>
                  <span class="identity-type">{identity.type}</span>
                </div>
                <span class="status" class:active={identity.status === 'active'}>
                  {identity.status}
                </span>
              </div>
              <div class="identity-meta">
                <span class="meta-item">Created {new Date(identity.createdAt).toLocaleDateString()}</span>
              </div>
              <div class="identity-actions">
                <button
                  onclick={() => deleteIdentity(identity.id, identity.displayName)}
                  class="delete-button"
                >
                  Delete
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {:else if activeTab === 'apps'}
      <!-- Apps tab -->
      {#if appIdentities.length === 0}
        <div class="empty-state">
          <p>No connected apps yet. Apps will appear here when they request permissions.</p>
        </div>
      {:else}
        <div class="identity-list">
          {#each appIdentities as identity}
            <div class="identity-card app-card">
              <div class="identity-header">
                <div class="identity-info">
                  <span class="identity-name">{identity.displayName}</span>
                  <span class="identity-origin">{identity.appConfig?.origin}</span>
                </div>
                <span class="status" class:active={identity.status === 'active'}>
                  {identity.status}
                </span>
              </div>
              {#if identity.appConfig?.grantedCapabilities?.length}
                <div class="capabilities">
                  <span class="capabilities-label">Permissions:</span>
                  <div class="capability-badges">
                    {#each identity.appConfig.grantedCapabilities as cap}
                      <span class="capability-badge">{cap}</span>
                    {/each}
                  </div>
                </div>
              {/if}
              <div class="identity-meta">
                <span class="meta-item">Connected {new Date(identity.createdAt).toLocaleDateString()}</span>
                <span class="meta-item">Namespace: {identity.appConfig?.namespace}</span>
              </div>
              <div class="identity-actions">
                <button
                  onclick={() => deleteIdentity(identity.id, identity.displayName)}
                  class="delete-button"
                >
                  Revoke Access
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {:else if activeTab === 'vault'}
      <!-- Vault tab -->
      {#if vaultSummary}
        <div class="vault-summary">
          <div class="summary-stats">
            <div class="stat">
              <span class="stat-value">{vaultSummary.totalIdentities}</span>
              <span class="stat-label">Total Identities</span>
            </div>
            <div class="stat">
              <span class="stat-value">{vaultSummary.totalGateways}</span>
              <span class="stat-label">Gateways</span>
            </div>
            <div class="stat">
              <span class="stat-value">{vaultSummary.ownerIdentities}</span>
              <span class="stat-label">Owner</span>
            </div>
            <div class="stat">
              <span class="stat-value">{vaultSummary.grantedIdentities}</span>
              <span class="stat-label">Granted</span>
            </div>
          </div>
        </div>
      {/if}

      {#if vaultIdentities.length === 0}
        <div class="empty-state">
          <p>Your vault is empty. Identities will appear here when you claim access to shared resources or connect to gateways.</p>
        </div>
      {:else}
        <div class="vault-groups">
          {#each Object.entries(vaultSummary?.identitiesByGateway || {}) as [gateway, gatewayIdentities]}
            <div class="vault-group">
              <h4 class="group-header">
                <span class="gateway-url">{gateway}</span>
                <span class="identity-count">{gatewayIdentities.length} {gatewayIdentities.length === 1 ? 'identity' : 'identities'}</span>
              </h4>
              <div class="identity-list">
                {#each gatewayIdentities as identity}
                  <div class="identity-card vault-card" class:primary={identity.isPrimary}>
                    <div class="identity-header">
                      <div class="identity-info">
                        <span class="identity-name">
                          {identity.displayName}
                          {#if identity.isPrimary}
                            <span class="primary-badge">Primary</span>
                          {/if}
                        </span>
                        <span class="identity-type">{identity.identityType}</span>
                      </div>
                      <span class="source-badge" class:owner={identity.source === 'owner'} class:granted={identity.source === 'granted'}>
                        {identity.source}
                      </span>
                    </div>
                    {#if identity.capabilities.length > 0}
                      <div class="capabilities">
                        <span class="capabilities-label">Capabilities:</span>
                        <div class="capability-badges">
                          {#each identity.capabilities as cap}
                            <span class="capability-badge">
                              {cap.capability}
                              {#if cap.resourceType}
                                <span class="resource-scope">({cap.resourceType}{cap.resourceId ? `:${cap.resourceId.slice(0, 8)}...` : ''})</span>
                              {/if}
                            </span>
                          {/each}
                        </div>
                      </div>
                    {/if}
                    <div class="identity-actions">
                      {#if !identity.isPrimary}
                        <button
                          onclick={() => setPrimaryIdentity(identity.identityId)}
                          class="set-primary-button"
                        >
                          Set as Primary
                        </button>
                      {/if}
                      <button
                        onclick={() => removeFromVault(identity.identityId, identity.displayName)}
                        class="delete-button"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  {/if}

  {#if newIdentitySecret}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-overlay" onclick={closeSecretModal} role="button" tabindex="-1">
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
        <h3>Identity Created!</h3>
        <p class="warning">Save this API key now! It won't be shown again.</p>
        <div class="secret-display">
          <input type="text" readonly value={newIdentitySecret} class="secret-input" />
          <button onclick={copySecret} class="copy-button">Copy</button>
        </div>
        <button onclick={closeSecretModal} class="close-button">Done</button>
      </div>
    </div>
  {/if}

  {#if toast.show}
    <div class="toast {toast.type}">
      {toast.message}
    </div>
  {/if}
</div>
{/if}

<style>
  .identities-manager {
    padding: 2rem;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }

  .header h2 {
    margin: 0;
    color: var(--color-white);
  }

  .create-button {
    padding: 0.75rem 1.5rem;
    background: rgba(139, 92, 246, 0.2);
    border: 1px solid rgba(139, 92, 246, 0.3);
    border-radius: 8px;
    color: var(--color-white);
    cursor: pointer;
    font-weight: 600;
    transition: all 0.2s;
  }

  .create-button:hover {
    background: rgba(139, 92, 246, 0.3);
    border-color: rgba(139, 92, 246, 0.5);
  }

  .create-form {
    padding: 2rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    margin-bottom: 2rem;
  }

  .create-form h3 {
    margin: 0 0 1rem 0;
    color: var(--color-white);
  }

  .form-row {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .name-input {
    flex: 1;
    padding: 0.75rem 1rem;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: var(--color-white);
    font-size: 0.9rem;
  }

  .name-input:focus {
    outline: none;
    border-color: rgba(139, 92, 246, 0.5);
  }

  .type-select {
    padding: 0.75rem 1rem;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: var(--color-white);
    font-size: 0.9rem;
    cursor: pointer;
  }

  .submit-button {
    padding: 0.75rem 2rem;
    background: rgba(139, 92, 246, 0.3);
    border: 1px solid rgba(139, 92, 246, 0.5);
    border-radius: 8px;
    color: var(--color-white);
    cursor: pointer;
    font-weight: 600;
    transition: all 0.2s;
  }

  .submit-button:hover {
    background: rgba(139, 92, 246, 0.4);
  }

  .tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding-bottom: 0.5rem;
  }

  .tab {
    padding: 0.75rem 1.5rem;
    background: transparent;
    border: none;
    color: var(--color-text-muted);
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    border-radius: 8px 8px 0 0;
    transition: all 0.2s;
  }

  .tab:hover {
    color: var(--color-white);
    background: rgba(255, 255, 255, 0.05);
  }

  .tab.active {
    color: var(--color-white);
    background: rgba(139, 92, 246, 0.2);
    border-bottom: 2px solid var(--color-primary, #8b5cf6);
  }

  .loading,
  .empty-state {
    text-align: center;
    padding: 3rem;
    color: var(--color-text-muted);
  }

  .empty-state .cta-button {
    display: inline-block;
    margin-top: 1rem;
    padding: 0.75rem 1.5rem;
    background: rgba(139, 92, 246, 0.2);
    border: 1px solid rgba(139, 92, 246, 0.3);
    border-radius: 8px;
    color: var(--color-white);
    text-decoration: none;
    font-weight: 600;
    transition: all 0.2s;
  }

  .identity-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .identity-card {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    padding: 1.25rem;
  }

  .identity-card.app-card {
    border-left: 3px solid rgba(59, 130, 246, 0.5);
  }

  .identity-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 0.75rem;
  }

  .identity-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .identity-name {
    color: var(--color-white);
    font-weight: 600;
    font-size: 1rem;
  }

  .identity-type {
    color: var(--color-text-muted);
    font-size: 0.8rem;
    text-transform: capitalize;
  }

  .identity-origin {
    color: var(--color-text-muted);
    font-size: 0.8rem;
    font-family: monospace;
  }

  .status {
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: capitalize;
    background: rgba(239, 68, 68, 0.2);
    color: #f87171;
  }

  .status.active {
    background: rgba(34, 197, 94, 0.2);
    color: #4ade80;
  }

  .capabilities {
    margin-bottom: 0.75rem;
  }

  .capabilities-label {
    display: block;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin-bottom: 0.5rem;
  }

  .capability-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .capability-badge {
    padding: 0.25rem 0.5rem;
    background: rgba(59, 130, 246, 0.15);
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-radius: 4px;
    font-size: 0.7rem;
    color: #60a5fa;
    font-family: monospace;
  }

  .identity-meta {
    display: flex;
    gap: 1.5rem;
    margin-bottom: 0.75rem;
  }

  .meta-item {
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  .identity-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  .delete-button {
    padding: 0.5rem 1rem;
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 6px;
    color: #f87171;
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 600;
    transition: all 0.2s;
  }

  .delete-button:hover {
    background: rgba(239, 68, 68, 0.25);
    border-color: rgba(239, 68, 68, 0.5);
  }

  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: rgba(20, 20, 20, 0.95);
    border: 1px solid rgba(139, 92, 246, 0.3);
    border-radius: 16px;
    padding: 2rem;
    max-width: 500px;
    width: 90%;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }

  .modal h3 {
    margin: 0 0 1rem 0;
    color: var(--color-white);
  }

  .warning {
    color: #facc15;
    margin: 0 0 1.5rem 0;
    font-weight: 600;
  }

  .secret-display {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
  }

  .secret-input {
    flex: 1;
    padding: 0.75rem 1rem;
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: var(--color-white);
    font-family: 'Courier New', monospace;
    font-size: 0.85rem;
  }

  .copy-button {
    padding: 0.75rem 1.5rem;
    background: rgba(139, 92, 246, 0.2);
    border: 1px solid rgba(139, 92, 246, 0.3);
    border-radius: 8px;
    color: var(--color-white);
    cursor: pointer;
    font-weight: 600;
    white-space: nowrap;
    transition: all 0.2s;
  }

  .copy-button:hover {
    background: rgba(139, 92, 246, 0.3);
  }

  .close-button {
    width: 100%;
    padding: 0.75rem;
    background: rgba(139, 92, 246, 0.3);
    border: 1px solid rgba(139, 92, 246, 0.5);
    border-radius: 8px;
    color: var(--color-white);
    cursor: pointer;
    font-weight: 600;
    transition: all 0.2s;
  }

  .close-button:hover {
    background: rgba(139, 92, 246, 0.4);
  }

  .toast {
    position: fixed;
    bottom: 2rem;
    right: 2rem;
    padding: 1rem 1.5rem;
    border-radius: 8px;
    color: var(--color-white);
    font-weight: 600;
    z-index: 1001;
    animation: slideIn 0.3s ease;
  }

  .toast.success {
    background: rgba(34, 197, 94, 0.9);
    border: 1px solid rgba(34, 197, 94, 1);
  }

  .toast.error {
    background: rgba(239, 68, 68, 0.9);
    border: 1px solid rgba(239, 68, 68, 1);
  }

  @keyframes slideIn {
    from {
      transform: translateY(100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @media (max-width: 768px) {
    .identities-manager {
      padding: 1rem;
    }

    .header {
      flex-direction: column;
      align-items: stretch;
      gap: 1rem;
    }

    .header h2 {
      font-size: 1.5rem;
    }

    .create-button {
      width: 100%;
    }

    .create-form {
      padding: 1rem;
    }

    .form-row {
      flex-direction: column;
    }

    .tabs {
      flex-direction: column;
    }

    .tab {
      text-align: left;
    }

    .identity-meta {
      flex-direction: column;
      gap: 0.25rem;
    }

    .modal {
      padding: 1.5rem;
      width: 95%;
    }

    .secret-display {
      flex-direction: column;
    }

    .copy-button {
      width: 100%;
    }

    .toast {
      left: 1rem;
      right: 1rem;
      bottom: 1rem;
    }

    .vault-summary {
      margin-bottom: 1.5rem;
    }

    .summary-stats {
      flex-direction: column;
      gap: 0.5rem;
    }
  }

  /* Vault-specific styles */
  .vault-summary {
    margin-bottom: 2rem;
  }

  .summary-stats {
    display: flex;
    gap: 1.5rem;
    flex-wrap: wrap;
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 1rem 1.5rem;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    min-width: 100px;
  }

  .stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--color-white);
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .vault-groups {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .vault-group {
    background: rgba(255, 255, 255, 0.01);
    border: 1px solid rgba(255, 255, 255, 0.03);
    border-radius: 12px;
    padding: 1.5rem;
  }

  .group-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 0 0 1rem 0;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .gateway-url {
    color: var(--color-white);
    font-weight: 600;
    font-size: 0.9rem;
    font-family: monospace;
  }

  .identity-count {
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  .vault-card {
    border-left: 3px solid rgba(139, 92, 246, 0.3);
  }

  .vault-card.primary {
    border-left-color: rgba(34, 197, 94, 0.7);
    background: rgba(34, 197, 94, 0.03);
  }

  .primary-badge {
    display: inline-block;
    margin-left: 0.5rem;
    padding: 0.15rem 0.5rem;
    background: rgba(34, 197, 94, 0.2);
    border: 1px solid rgba(34, 197, 94, 0.3);
    border-radius: 4px;
    font-size: 0.65rem;
    font-weight: 600;
    color: #4ade80;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .source-badge {
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: capitalize;
  }

  .source-badge.owner {
    background: rgba(59, 130, 246, 0.2);
    color: #60a5fa;
  }

  .source-badge.granted {
    background: rgba(249, 115, 22, 0.2);
    color: #fb923c;
  }

  .resource-scope {
    font-size: 0.65rem;
    color: var(--color-text-muted);
    margin-left: 0.25rem;
  }

  .set-primary-button {
    padding: 0.5rem 1rem;
    background: rgba(34, 197, 94, 0.15);
    border: 1px solid rgba(34, 197, 94, 0.3);
    border-radius: 6px;
    color: #4ade80;
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 600;
    transition: all 0.2s;
  }

  .set-primary-button:hover {
    background: rgba(34, 197, 94, 0.25);
    border-color: rgba(34, 197, 94, 0.5);
  }
</style>

<script lang="ts">
  import { onMount } from 'svelte';
  import { createGatewayClient, withAuth } from '../../api/client';

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
  let activeTab = $state<'users' | 'apps'>('users');

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

  onMount(async () => {
    apiKey = localStorage.getItem(STORAGE_KEY_API);
    gatewayUrl = localStorage.getItem(STORAGE_KEY_URL);
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
    {:else}
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
  }
</style>

<script lang="ts">
  import { onMount } from 'svelte';
  import { createGatewayClient, withAuth } from '../../api/client';


  const STORAGE_KEY_API = 'federise:gateway:apiKey';
  const STORAGE_KEY_URL = 'federise:gateway:url';

  let principals = $state<any[]>([]);
  let loading = $state(true);
  let showCreateForm = $state(false);
  let newPrincipalName = $state('');
  let newPrincipalSecret = $state('');
  let toast = $state({ show: false, message: '', type: 'success' as 'success' | 'error' });

  let apiKey = $state<string | null>(null);
  let gatewayUrl = $state<string | null>(null);

  async function loadPrincipals() {
    if (!apiKey || !gatewayUrl) {
      loading = false;
      return;
    }

    loading = true;
    try {
      const client = createGatewayClient(gatewayUrl);
      const { data, error } = await client.POST('/principal/list', withAuth(apiKey));

      if (data) {
        principals = data.items;
      } else {
        showToast('Failed to load principals', 'error');
      }
    } catch (error) {
      console.error('Failed to load principals:', error);
      showToast('Failed to load principals', 'error');
    }
    loading = false;
  }

  async function createPrincipal() {
    if (!newPrincipalName.trim()) {
      showToast('Please enter a principal name', 'error');
      return;
    }

    if (!apiKey || !gatewayUrl) {
      showToast('No gateway configured', 'error');
      return;
    }

    try {
      const client = createGatewayClient(gatewayUrl);
      const { data, error } = await client.POST('/principal/create', {
        ...withAuth(apiKey),
        body: { display_name: newPrincipalName },
      });

      if (data) {
        newPrincipalSecret = data.secret;
        showToast('Principal created!', 'success');
        await loadPrincipals();
        newPrincipalName = '';
      } else {
        showToast(error?.message || 'Failed to create principal', 'error');
      }
    } catch (error) {
      console.error('Failed to create principal:', error);
      showToast('Failed to create principal', 'error');
    }
  }

  async function deletePrincipal(secretHash: string, displayName: string) {
    if (!confirm(`Delete principal "${displayName}"? This cannot be undone.`)) {
      return;
    }

    if (!apiKey || !gatewayUrl) {
      showToast('No gateway configured', 'error');
      return;
    }

    try {
      const client = createGatewayClient(gatewayUrl);
      const { error } = await client.POST('/principal/delete', {
        ...withAuth(apiKey),
        body: { secret_hash: secretHash },
      });

      if (!error) {
        showToast('Principal deleted', 'success');
        await loadPrincipals();
      } else {
        showToast(error.message || 'Failed to delete principal', 'error');
      }
    } catch (error) {
      console.error('Failed to delete principal:', error);
      showToast('Failed to delete principal', 'error');
    }
  }

  function showToast(message: string, type: 'success' | 'error') {
    toast = { show: true, message, type };
    setTimeout(() => {
      toast = { show: false, message: '', type: 'success' };
    }, 3000);
  }

  function copySecret() {
    navigator.clipboard.writeText(newPrincipalSecret);
    showToast('API key copied to clipboard', 'success');
  }

  function closeSecretModal() {
    newPrincipalSecret = '';
  }

  onMount(() => {
    apiKey = localStorage.getItem(STORAGE_KEY_API);
    gatewayUrl = localStorage.getItem(STORAGE_KEY_URL);
    loadPrincipals();
  });
</script>

<div class="principals-manager">
  {#if !apiKey || !gatewayUrl}
    <div class="empty-state">
      <p>No gateway configured. Please set up your gateway first.</p>
      <a href="/start" class="cta-button">Go to Setup</a>
    </div>
  {:else}
    <div class="header">
      <h2>API Principals</h2>
      <button onclick={() => (showCreateForm = !showCreateForm)} class="create-button">
        {showCreateForm ? 'Cancel' : '+ Create Principal'}
      </button>
    </div>

    {#if showCreateForm}
      <div class="create-form">
        <h3>Create New Principal</h3>
        <input
          type="text"
          bind:value={newPrincipalName}
          placeholder="Principal name (e.g., 'Mobile App', 'Production Server')"
          class="name-input"
        />
        <button onclick={createPrincipal} class="submit-button">Create</button>
      </div>
    {/if}

    {#if loading}
      <div class="loading">Loading principals...</div>
    {:else if principals.length === 0}
      <div class="empty-state">
        <p>No principals yet. Create one to get started.</p>
      </div>
    {:else}
      <div class="principals-list">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Secret Hash</th>
              <th>Created</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each principals as principal}
              <tr>
                <td class="principal-name">{principal.display_name}</td>
                <td class="secret-hash">{principal.secret_hash.substring(0, 16)}...</td>
                <td class="created-date">{new Date(principal.created_at).toLocaleDateString()}</td>
                <td>
                  <span class="status" class:active={principal.active}>
                    {principal.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <button
                    onclick={() => deletePrincipal(principal.secret_hash, principal.display_name)}
                    class="delete-button">
                    Delete
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}

  {#if newPrincipalSecret}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-overlay" onclick={closeSecretModal} role="button" tabindex="-1">
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
        <h3>Principal Created!</h3>
        <p class="warning">⚠️ Save this API key now! It won't be shown again.</p>
        <div class="secret-display">
          <input type="text" readonly value={newPrincipalSecret} class="secret-input" />
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

<style>
  .principals-manager {
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

  .name-input {
    width: 100%;
    padding: 0.75rem 1rem;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: var(--color-white);
    font-size: 0.9rem;
    margin-bottom: 1rem;
  }

  .name-input:focus {
    outline: none;
    border-color: rgba(139, 92, 246, 0.5);
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

  .principals-list {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    overflow: hidden;
  }

  thead {
    background: rgba(255, 255, 255, 0.05);
  }

  th {
    padding: 1rem;
    text-align: left;
    color: var(--color-text-muted);
    font-weight: 600;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  td {
    padding: 1rem;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    color: var(--color-text);
  }

  .principal-name {
    color: var(--color-white);
    font-weight: 500;
  }

  .secret-hash {
    font-family: 'Courier New', monospace;
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }

  .created-date {
    color: var(--color-text-muted);
    font-size: 0.9rem;
  }

  .status {
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.8rem;
    font-weight: 600;
    background: rgba(239, 68, 68, 0.2);
    color: #f87171;
  }

  .status.active {
    background: rgba(34, 197, 94, 0.2);
    color: #4ade80;
  }

  .delete-button {
    padding: 0.5rem 1rem;
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 6px;
    color: #f87171;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 600;
    transition: all 0.2s;
  }

  .delete-button:hover {
    background: rgba(239, 68, 68, 0.3);
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
</style>

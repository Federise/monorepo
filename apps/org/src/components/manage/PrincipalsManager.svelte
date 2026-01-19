<script lang="ts">
  import { onMount } from 'svelte';
  import { createGatewayClient, withAuth } from '../../api/client';


  const STORAGE_KEY_API = 'federise:gateway:apiKey';
  const STORAGE_KEY_URL = 'federise:gateway:url';

  interface Identity {
    id: string;
    type: string;
    displayName: string;
    status: string;
    createdAt: string;
  }

  let identities = $state<Identity[]>([]);
  let loading = $state(true);
  let showCreateForm = $state(false);
  let newIdentityName = $state('');
  let newIdentitySecret = $state('');
  let toast = $state({ show: false, message: '', type: 'success' as 'success' | 'error' });
  let loaded = $state(false);

  let apiKey = $state<string | null>(null);
  let gatewayUrl = $state<string | null>(null);

  async function loadIdentities() {
    if (!apiKey || !gatewayUrl) {
      loading = false;
      return;
    }

    loading = true;
    try {
      const client = createGatewayClient(gatewayUrl);
      const { data, error } = await client.POST('/identity/list', withAuth(apiKey));

      if (data) {
        identities = data.identities;
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
      showToast('Please enter an identity name', 'error');
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
        body: { displayName: newIdentityName },
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
    if (!confirm(`Delete identity "${displayName}"? This cannot be undone.`)) {
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

  onMount(async () => {
    apiKey = localStorage.getItem(STORAGE_KEY_API);
    gatewayUrl = localStorage.getItem(STORAGE_KEY_URL);
    await loadIdentities();
    loaded = true;
  });
</script>

{#if loaded}
<div class="principals-manager">
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
        <input
          type="text"
          bind:value={newIdentityName}
          placeholder="Identity name (e.g., 'Mobile App', 'Production Server')"
          class="name-input"
        />
        <button onclick={createIdentity} class="submit-button">Create</button>
      </div>
    {/if}

    {#if loading}
      <div class="loading">Loading identities...</div>
    {:else if identities.length === 0}
      <div class="empty-state">
        <p>No identities yet. Create one to get started.</p>
      </div>
    {:else}
      <div class="principals-list">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Created</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each identities as identity}
              <tr>
                <td class="principal-name">{identity.displayName}</td>
                <td class="identity-type">{identity.type}</td>
                <td class="created-date">{new Date(identity.createdAt).toLocaleDateString()}</td>
                <td>
                  <span class="status" class:active={identity.status === 'active'}>
                    {identity.status}
                  </span>
                </td>
                <td>
                  <button
                    onclick={() => deleteIdentity(identity.id, identity.displayName)}
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

  {#if newIdentitySecret}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-overlay" onclick={closeSecretModal} role="button" tabindex="-1">
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
        <h3>Identity Created!</h3>
        <p class="warning">⚠️ Save this API key now! It won't be shown again.</p>
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

  .identity-type {
    font-size: 0.85rem;
    color: var(--color-text-muted);
    text-transform: capitalize;
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

  @media (max-width: 768px) {
    .principals-manager {
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

    /* Make table responsive with card layout */
    .principals-list {
      overflow-x: visible;
    }

    table {
      border: none;
      background: transparent;
    }

    thead {
      display: none;
    }

    tbody {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    tr {
      display: flex;
      flex-direction: column;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 1rem;
      gap: 0.75rem;
    }

    td {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0;
      border: none;
    }

    td::before {
      content: attr(data-label);
      font-weight: 600;
      color: var(--color-text-muted);
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .principal-name::before {
      content: 'Name';
    }

    .identity-type::before {
      content: 'Type';
    }

    .created-date::before {
      content: 'Created';
    }

    td:nth-child(4)::before {
      content: 'Status';
    }

    td:nth-child(5)::before {
      content: 'Actions';
    }

    .delete-button {
      width: auto;
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

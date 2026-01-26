<script lang="ts">
  import { onMount } from 'svelte';
  import { getAllPermissions, revokePermissions } from '../lib/permissions';
  import type { PermissionRecord } from '../lib/protocol';

  let appPermissions = $state<PermissionRecord[]>([]);
  let loaded = $state(false);
  let loadError = $state<string | null>(null);
  let isRevoking = $state(false);

  onMount(async () => {
    await loadPermissions();
    loaded = true;
  });

  async function loadPermissions() {
    loadError = null;
    try {
      appPermissions = await getAllPermissions();
    } catch (err) {
      console.error('Failed to load permissions:', err);
      const message = err instanceof Error ? err.message : 'Failed to load permissions';
      // Check for common error types
      if (message.includes('Unauthorized') || message.includes('401')) {
        loadError = 'Unable to authenticate with the gateway. Please check your connection settings.';
      } else if (message.includes('Gateway not configured')) {
        loadError = 'Gateway not configured. Please set up your connection first.';
      } else {
        loadError = message;
      }
      showToast('Failed to load permissions');
    }
  }

  async function revokeAppPermission(origin: string) {
    isRevoking = true;
    try {
      await revokePermissions(origin);
      await loadPermissions();
      showToast('Permission revoked');
    } catch (err) {
      console.error('Failed to revoke permission:', err);
      showToast('Failed to revoke permission');
    } finally {
      isRevoking = false;
    }
  }

  function showToast(message: string) {
    const event = new CustomEvent('show-toast', { detail: message });
    window.dispatchEvent(event);
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  }
</script>

{#if loaded}
<div class="page">
  <header class="page-header">
    <h1>App Permissions</h1>
    <p>Manage which apps have access to your Federise capabilities.</p>
  </header>

  <section class="card">
    <h2>Connected Apps</h2>
    {#if loadError}
      <div class="error-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p>{loadError}</p>
        <button class="btn btn-small btn-secondary" onclick={loadPermissions}>
          Try Again
        </button>
      </div>
    {:else if appPermissions.length === 0}
      <div class="empty-list">
        <p>No apps have been granted permissions yet.</p>
      </div>
    {:else}
      <div class="permissions-list">
        {#each appPermissions as perm}
          <div class="permission-card">
            <div class="permission-info">
              <span class="app-origin">{perm.origin}</span>
              <span class="granted-date">Granted {formatDate(perm.grantedAt)}</span>
              <div class="capabilities">
                {#each perm.capabilities as cap}
                  <span class="capability-tag">{cap}</span>
                {/each}
              </div>
            </div>
            <button class="btn btn-small btn-danger" onclick={() => revokeAppPermission(perm.origin)} disabled={isRevoking}>
              {isRevoking ? 'Revoking...' : 'Revoke'}
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </section>
</div>
{/if}

<style>
  .page {
    max-width: 900px;
    padding: 2rem 3rem;
  }

  .page-header {
    margin-bottom: 2rem;
  }

  .page-header h1 {
    font-size: var(--font-size-2xl);
    font-weight: 600;
    margin-bottom: var(--space-sm);
    color: var(--color-white);
  }

  .page-header p {
    color: var(--color-text-muted);
    font-size: 0.95rem;
  }

  .card {
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-xl);
    padding: var(--space-xl);
    margin-bottom: var(--space-xl);
  }

  .card h2 {
    font-size: var(--font-size-lg);
    font-weight: 600;
    margin-bottom: var(--space-sm);
    color: var(--color-white);
  }

  .empty-list {
    padding: var(--space-2xl);
    text-align: center;
    color: var(--color-text-subtle);
  }

  .error-state {
    padding: var(--space-2xl);
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
  }

  .error-state svg {
    color: var(--color-error);
    opacity: 0.8;
  }

  .error-state p {
    color: var(--color-text);
    margin: 0;
    max-width: 400px;
  }

  .btn-secondary {
    background: var(--surface-3);
    color: var(--color-white);
    border: 1px solid var(--border-normal);
  }

  .btn-secondary:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.15);
  }

  .permissions-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .permission-card {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: var(--space-lg);
    background: var(--surface-dark);
    border-radius: var(--radius-lg);
  }

  .permission-info {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .app-origin {
    font-weight: 500;
    color: var(--color-white);
    font-size: var(--font-size-md);
  }

  .granted-date {
    font-size: var(--font-size-sm);
    color: var(--color-text-subtle);
  }

  .capabilities {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: var(--space-sm);
  }

  .capability-tag {
    padding: var(--space-xs) var(--space-sm);
    background: var(--color-primary-light);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
    color: #a78bfa;
  }

  .btn {
    padding: 0.7rem var(--space-xl);
    border-radius: var(--radius-md);
    font-weight: 500;
    font-size: var(--font-size-md);
    font-family: inherit;
    cursor: pointer;
    border: none;
    transition: all var(--transition-fast);
  }

  .btn-small {
    padding: var(--space-sm) 0.9rem;
    font-size: var(--font-size-sm);
  }

  .btn-danger {
    background: rgba(239, 68, 68, 0.15);
    color: var(--color-error);
    border: 1px solid var(--border-error);
  }

  .btn-danger:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.25);
  }

  @media (max-width: 900px) {
    .page {
      padding: 1.5rem;
    }
  }
</style>

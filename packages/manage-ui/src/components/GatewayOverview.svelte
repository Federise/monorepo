<script lang="ts">
  import { onMount } from 'svelte';
  import { getAllPermissions } from '../lib/permissions';
  import type { PermissionRecord } from '../lib/protocol';
  import { createGatewayClient, withAuth } from '../lib/client';
  import { getPrimaryIdentity } from '../utils/vault';

  let isConnected = $state(false);
  let gatewayUrl = $state('');
  let appPermissions = $state<PermissionRecord[]>([]);
  let loaded = $state(false);

  onMount(async () => {
    const identity = getPrimaryIdentity();

    if (identity) {
      gatewayUrl = identity.gatewayUrl;

      // Check connection
      try {
        const client = createGatewayClient(identity.gatewayUrl);
        const { data } = await client.GET('/ping', withAuth(identity.apiKey));
        isConnected = data?.message === 'pong';
      } catch {
        isConnected = false;
      }
    }

    try {
      appPermissions = await getAllPermissions();
    } catch {
      // Silently handle - permissions may not be available if not connected
    }
    loaded = true;
  });
</script>

{#if loaded}
<div class="page">
  <header class="page-header">
    <h1>Overview</h1>
    <p>Quick stats and status for your connected gateway.</p>
  </header>

  {#if !isConnected}
    <section class="card empty-state">
      <h2>No Gateway Connected</h2>
      <p>Connect a gateway first to see overview stats.</p>
      <a href="/manage/connection" class="btn btn-primary">
        Connect Gateway
      </a>
    </section>
  {:else}
    <section class="card">
      <h2>Quick Stats</h2>
      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-value">{appPermissions.length}</span>
          <span class="stat-label">Apps Connected</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">—</span>
          <span class="stat-label">KV Namespaces</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">—</span>
          <span class="stat-label">Total Keys</span>
        </div>
      </div>
    </section>

    <section class="card">
      <h2>Connection Details</h2>
      <div class="details-list">
        <div class="detail-row">
          <span class="detail-label">Status</span>
          <span class="detail-value status-badge connected">Connected</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Gateway URL</span>
          <span class="detail-value">{gatewayUrl}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Protocol Version</span>
          <span class="detail-value">1.0.0</span>
        </div>
      </div>
    </section>
  {/if}
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

  .card.empty-state {
    text-align: center;
    padding: var(--space-3xl);
  }

  .card.empty-state h2 {
    margin-bottom: var(--space-md);
  }

  .card.empty-state p {
    color: var(--color-text-muted);
    margin-bottom: var(--space-xl);
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

  .btn-primary {
    background: var(--color-primary);
    color: var(--color-white);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-lg);
  }

  .stat-card {
    background: var(--surface-dark);
    border-radius: var(--radius-lg);
    padding: var(--space-xl);
    text-align: center;
  }

  .stat-value {
    display: block;
    font-size: var(--font-size-2xl);
    font-weight: 600;
    color: var(--color-white);
    margin-bottom: var(--space-xs);
  }

  .stat-label {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
  }

  .details-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-md) 0;
    border-bottom: 1px solid var(--border-subtle);
  }

  .detail-row:last-child {
    border-bottom: none;
  }

  .detail-label {
    font-size: var(--font-size-base);
    color: var(--color-text-muted);
  }

  .detail-value {
    font-size: var(--font-size-base);
    color: var(--color-white);
  }

  .status-badge {
    padding: 0.3rem 0.7rem;
    border-radius: var(--radius-full);
    font-size: var(--font-size-sm);
    font-weight: 500;
  }

  .status-badge.connected {
    background: var(--color-success-light);
    color: var(--color-success);
  }

  @media (max-width: 900px) {
    .page {
      padding: 1.5rem;
    }

    .stats-grid {
      grid-template-columns: 1fr;
    }
  }
</style>

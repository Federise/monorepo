<script lang="ts">
  import { onMount } from 'svelte';
  import { createGatewayClient, withAuth } from '../../api/client';
  import { getPrimaryIdentity } from '../../utils/vault';

  type Tab = 'kv' | 'blob';

  interface KVEntry {
    key: string;
    value: string;
  }

  interface KVNamespace {
    namespace: string;
    entries: KVEntry[];
  }

  interface BlobMetadata {
    key: string;
    namespace: string;
    size: number;
    contentType: string;
    uploadedAt: string;
    isPublic: boolean;
  }

  let activeTab = $state<Tab>('kv');
  let isConnected = $state(false);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // KV state
  let kvNamespaces = $state<KVNamespace[]>([]);
  let expandedNamespaces = $state<Set<string>>(new Set());

  // Blob state
  let blobs = $state<BlobMetadata[]>([]);
  let blobsByNamespace = $derived.by(() => {
    const grouped: Record<string, BlobMetadata[]> = {};
    for (const blob of blobs) {
      if (!grouped[blob.namespace]) {
        grouped[blob.namespace] = [];
      }
      grouped[blob.namespace].push(blob);
    }
    return grouped;
  });
  let expandedBlobNamespaces = $state<Set<string>>(new Set());

  function showToast(message: string) {
    const event = new CustomEvent('show-toast', { detail: message });
    window.dispatchEvent(event);
  }

  async function loadData() {
    const identity = getPrimaryIdentity();
    if (!identity) {
      isConnected = false;
      loading = false;
      return;
    }

    try {
      const client = createGatewayClient(identity.gatewayUrl);

      // Check connection
      const { data: pingData } = await client.GET('/ping', withAuth(identity.apiKey));
      if (pingData?.message !== 'pong') {
        isConnected = false;
        loading = false;
        return;
      }
      isConnected = true;

      // Load KV dump
      const { data: kvData, error: kvError } = await client.POST('/kv/dump', withAuth(identity.apiKey));
      if (kvError) {
        console.error('KV dump error:', kvError);
      } else if (kvData) {
        kvNamespaces = kvData;
      }

      // Load blobs
      const { data: blobData, error: blobError } = await client.POST('/blob/list', {
        ...withAuth(identity.apiKey),
        body: {},
      });
      if (blobError) {
        console.error('Blob list error:', blobError);
      } else if (blobData) {
        blobs = blobData.blobs;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load data';
    } finally {
      loading = false;
    }
  }

  function toggleNamespace(namespace: string) {
    if (expandedNamespaces.has(namespace)) {
      expandedNamespaces.delete(namespace);
    } else {
      expandedNamespaces.add(namespace);
    }
    expandedNamespaces = new Set(expandedNamespaces);
  }

  function toggleBlobNamespace(namespace: string) {
    if (expandedBlobNamespaces.has(namespace)) {
      expandedBlobNamespaces.delete(namespace);
    } else {
      expandedBlobNamespaces.add(namespace);
    }
    expandedBlobNamespaces = new Set(expandedBlobNamespaces);
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString();
  }

  function truncateValue(value: string, maxLength = 100): string {
    if (value.length <= maxLength) return value;
    return value.slice(0, maxLength) + '...';
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    showToast(`${label} copied!`);
  }

  onMount(() => {
    loadData();
  });
</script>

<div class="page">
  <header class="page-header">
    <h1>Data Browser</h1>
    <p>Browse and manage your stored data.</p>
  </header>

  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading data...</p>
    </div>
  {:else if !isConnected}
    <section class="card empty-state">
      <h2>No Gateway Connected</h2>
      <p>Connect a gateway first to browse data.</p>
      <a href="/manage/connection" class="btn btn-primary">Connect Gateway</a>
    </section>
  {:else if error}
    <section class="card error-state">
      <h2>Error</h2>
      <p>{error}</p>
      <button class="btn btn-primary" onclick={() => { loading = true; error = null; loadData(); }}>
        Retry
      </button>
    </section>
  {:else}
    <div class="tabs">
      <button
        class="tab"
        class:active={activeTab === 'kv'}
        onclick={() => activeTab = 'kv'}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18" />
          <path d="M9 21V9" />
        </svg>
        KV Storage
        <span class="badge">{kvNamespaces.reduce((acc, ns) => acc + ns.entries.length, 0)}</span>
      </button>
      <button
        class="tab"
        class:active={activeTab === 'blob'}
        onclick={() => activeTab = 'blob'}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        Blob Storage
        <span class="badge">{blobs.length}</span>
      </button>
    </div>

    {#if activeTab === 'kv'}
      <section class="card">
        <div class="card-header">
          <h2>KV Namespaces</h2>
          <button class="btn btn-secondary btn-sm" onclick={() => { loading = true; loadData(); }}>
            Refresh
          </button>
        </div>

        {#if kvNamespaces.length === 0}
          <div class="empty-list">
            <p>No KV data stored yet.</p>
          </div>
        {:else}
          <div class="namespace-list">
            {#each kvNamespaces as ns}
              <div class="namespace-item">
                <button class="namespace-header" onclick={() => toggleNamespace(ns.namespace)}>
                  <span class="expand-icon" class:expanded={expandedNamespaces.has(ns.namespace)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </span>
                  <span class="namespace-name">{ns.namespace}</span>
                  <span class="namespace-count">{ns.entries.length} {ns.entries.length === 1 ? 'key' : 'keys'}</span>
                </button>

                {#if expandedNamespaces.has(ns.namespace)}
                  <div class="entries-list">
                    {#each ns.entries as entry}
                      <div class="entry-item">
                        <div class="entry-key">
                          <code>{entry.key}</code>
                          <button class="copy-btn" onclick={() => copyToClipboard(entry.key, 'Key')}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          </button>
                        </div>
                        <div class="entry-value">
                          <code>{truncateValue(entry.value)}</code>
                          <button class="copy-btn" onclick={() => copyToClipboard(entry.value, 'Value')}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </section>
    {:else}
      <section class="card">
        <div class="card-header">
          <h2>Blob Storage</h2>
          <button class="btn btn-secondary btn-sm" onclick={() => { loading = true; loadData(); }}>
            Refresh
          </button>
        </div>

        {#if blobs.length === 0}
          <div class="empty-list">
            <p>No files stored yet.</p>
          </div>
        {:else}
          <div class="namespace-list">
            {#each Object.entries(blobsByNamespace) as [namespace, nsBlobs]}
              <div class="namespace-item">
                <button class="namespace-header" onclick={() => toggleBlobNamespace(namespace)}>
                  <span class="expand-icon" class:expanded={expandedBlobNamespaces.has(namespace)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </span>
                  <span class="namespace-name">{namespace}</span>
                  <span class="namespace-count">{nsBlobs.length} {nsBlobs.length === 1 ? 'file' : 'files'}</span>
                </button>

                {#if expandedBlobNamespaces.has(namespace)}
                  <div class="blob-list">
                    {#each nsBlobs as blob}
                      <div class="blob-item">
                        <div class="blob-icon">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                        </div>
                        <div class="blob-info">
                          <div class="blob-name">{blob.key}</div>
                          <div class="blob-meta">
                            <span>{blob.contentType}</span>
                            <span class="separator">•</span>
                            <span>{formatBytes(blob.size)}</span>
                            <span class="separator">•</span>
                            <span>{formatDate(blob.uploadedAt)}</span>
                            {#if blob.isPublic}
                              <span class="separator">•</span>
                              <span class="public-badge">Public</span>
                            {/if}
                          </div>
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </section>
    {/if}
  {/if}
</div>

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

  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-3xl);
    color: var(--color-text-muted);
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--border-subtle);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-bottom: var(--space-md);
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .tabs {
    display: flex;
    gap: var(--space-sm);
    margin-bottom: var(--space-xl);
    border-bottom: 1px solid var(--border-subtle);
    padding-bottom: var(--space-sm);
  }

  .tab {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-lg);
    background: transparent;
    border: none;
    border-radius: var(--radius-md);
    color: var(--color-text-muted);
    font-size: var(--font-size-base);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .tab:hover {
    color: var(--color-white);
    background: var(--surface-2);
  }

  .tab.active {
    color: var(--color-white);
    background: var(--color-primary);
  }

  .tab .badge {
    padding: 0.15rem 0.5rem;
    background: rgba(255, 255, 255, 0.2);
    border-radius: var(--radius-full);
    font-size: var(--font-size-sm);
  }

  .card {
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-xl);
    padding: var(--space-xl);
    margin-bottom: var(--space-xl);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-lg);
  }

  .card h2 {
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--color-white);
    margin: 0;
  }

  .card.empty-state,
  .card.error-state {
    text-align: center;
    padding: var(--space-3xl);
  }

  .card.empty-state p,
  .card.error-state p {
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
    text-decoration: none;
    display: inline-block;
  }

  .btn-sm {
    padding: 0.4rem var(--space-md);
    font-size: var(--font-size-sm);
  }

  .btn-primary {
    background: var(--color-primary);
    color: var(--color-white);
  }

  .btn-primary:hover {
    background: var(--color-primary-hover);
  }

  .btn-secondary {
    background: var(--surface-3);
    color: var(--color-white);
    border: 1px solid var(--border-normal);
  }

  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  .empty-list {
    padding: var(--space-2xl);
    text-align: center;
    color: var(--color-text-subtle);
  }

  .namespace-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .namespace-item {
    background: var(--surface-darker);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .namespace-header {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    width: 100%;
    padding: var(--space-lg);
    background: transparent;
    border: none;
    color: var(--color-white);
    font-size: var(--font-size-base);
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .namespace-header:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .expand-icon {
    display: flex;
    transition: transform var(--transition-fast);
  }

  .expand-icon.expanded {
    transform: rotate(90deg);
  }

  .namespace-name {
    flex: 1;
    text-align: left;
    font-family: monospace;
    font-size: var(--font-size-sm);
    color: var(--color-text);
    word-break: break-all;
  }

  .namespace-count {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
  }

  .entries-list {
    border-top: 1px solid var(--border-subtle);
    padding: var(--space-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .entry-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    padding: var(--space-md);
    background: var(--surface-1);
    border-radius: var(--radius-md);
  }

  .entry-key,
  .entry-value {
    display: flex;
    align-items: flex-start;
    gap: var(--space-sm);
  }

  .entry-key code {
    color: var(--color-primary);
    font-size: var(--font-size-sm);
    word-break: break-all;
  }

  .entry-value code {
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
    word-break: break-all;
    flex: 1;
  }

  .copy-btn {
    padding: 0.25rem;
    background: transparent;
    border: none;
    color: var(--color-text-subtle);
    cursor: pointer;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }

  .copy-btn:hover {
    color: var(--color-white);
    background: var(--surface-3);
  }

  .blob-list {
    border-top: 1px solid var(--border-subtle);
    padding: var(--space-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .blob-item {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md);
    background: var(--surface-1);
    border-radius: var(--radius-md);
  }

  .blob-icon {
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  .blob-info {
    flex: 1;
    min-width: 0;
  }

  .blob-name {
    color: var(--color-white);
    font-size: var(--font-size-base);
    font-weight: 500;
    word-break: break-all;
  }

  .blob-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-xs);
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
    margin-top: var(--space-xs);
  }

  .separator {
    opacity: 0.5;
  }

  .public-badge {
    padding: 0.1rem 0.4rem;
    background: var(--color-success-light);
    color: var(--color-success);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
    font-weight: 500;
  }

  @media (max-width: 900px) {
    .page {
      padding: 1.5rem;
    }

    .tabs {
      flex-wrap: wrap;
    }

    .tab {
      flex: 1;
      justify-content: center;
    }

    .blob-meta {
      flex-direction: column;
      align-items: flex-start;
    }

    .separator {
      display: none;
    }
  }
</style>

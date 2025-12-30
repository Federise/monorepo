<script lang="ts">
  import { onMount } from 'svelte';
  import { getClient } from '../../stores/federise.svelte';
  import type { BlobMetadata } from '@federise/sdk';

  let files = $state<BlobMetadata[]>([]);
  let isLoading = $state(true);
  let isUploading = $state(false);
  let error = $state<string | null>(null);

  let fileInput: HTMLInputElement;

  onMount(() => {
    loadFiles();
  });

  async function loadFiles() {
    const client = getClient();
    if (!client) return;

    isLoading = true;
    error = null;

    try {
      files = await client.blob.list();
      files.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load files';
    } finally {
      isLoading = false;
    }
  }

  async function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const selectedFiles = input.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const client = getClient();
    if (!client) return;

    isUploading = true;
    error = null;

    try {
      for (const file of selectedFiles) {
        await client.blob.upload(file, { isPublic: false });
      }
      await loadFiles();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to upload file';
    } finally {
      isUploading = false;
      input.value = '';
    }
  }

  async function downloadFile(file: BlobMetadata) {
    const client = getClient();
    if (!client) return;

    try {
      const { url } = await client.blob.get(file.key);
      window.open(url, '_blank');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to download file';
    }
  }

  async function deleteFile(file: BlobMetadata) {
    const client = getClient();
    if (!client) return;

    if (!confirm(`Delete "${file.key}"?`)) return;

    try {
      await client.blob.delete(file.key);
      files = files.filter((f) => f.key !== file.key);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to delete file';
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function getFileIcon(contentType: string): string {
    if (contentType.startsWith('image/')) return 'image';
    if (contentType.startsWith('video/')) return 'video';
    if (contentType.startsWith('audio/')) return 'audio';
    if (contentType.includes('pdf')) return 'pdf';
    if (contentType.includes('zip') || contentType.includes('archive')) return 'archive';
    return 'file';
  }
</script>

<div class="files-app">
  <div class="files-panel card">
    <div class="panel-header">
      <h2>Files</h2>
      <button
        class="btn btn-primary btn-sm"
        onclick={() => fileInput.click()}
        disabled={isUploading}
      >
        {#if isUploading}
          <div class="btn-spinner"></div>
          Uploading...
        {:else}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Upload
        {/if}
      </button>
      <input
        type="file"
        bind:this={fileInput}
        onchange={handleFileSelect}
        multiple
        class="hidden-input"
      />
    </div>

    {#if isLoading}
      <div class="empty-state">
        <div class="spinner"></div>
        <p>Loading files...</p>
      </div>
    {:else if files.length === 0}
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        <p>No files yet</p>
        <button class="btn btn-primary" onclick={() => fileInput.click()}>Upload your first file</button>
      </div>
    {:else}
      <ul class="files-list">
        {#each files as file (file.key)}
          <li>
            <div class="file-icon">
              {#if getFileIcon(file.contentType) === 'image'}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              {:else}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              {/if}
            </div>
            <div class="file-info">
              <span class="file-name">{file.key}</span>
              <span class="file-meta">
                {formatSize(file.size)} &middot; {formatDate(file.uploadedAt)}
                {#if file.isPublic}
                  <span class="public-badge">Public</span>
                {/if}
              </span>
            </div>
            <div class="file-actions">
              <button
                class="action-btn"
                onclick={() => downloadFile(file)}
                title="Download"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
              <button
                class="action-btn danger"
                onclick={() => deleteFile(file)}
                title="Delete"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

{#if error}
  <div class="error-toast">
    {error}
    <button class="toast-close" onclick={() => (error = null)}>&times;</button>
  </div>
{/if}

<style>
  .files-app {
    height: calc(100vh - 180px);
    min-height: 400px;
  }

  .files-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--color-border);
    margin-bottom: 0.5rem;
  }

  .panel-header h2 {
    flex: 1;
    font-size: 1rem;
    font-weight: 600;
  }

  .btn-sm {
    padding: 0.375rem 0.75rem;
    font-size: 0.8rem;
  }

  .btn-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .hidden-input {
    display: none;
  }

  .files-list {
    list-style: none;
    overflow-y: auto;
    flex: 1;
    margin: 0 -1.5rem;
    padding: 0;
  }

  .files-list li {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1.5rem;
    border-bottom: 1px solid var(--color-border);
  }

  .files-list li:hover {
    background: var(--color-surface-hover);
  }

  .file-icon {
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  .file-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .file-name {
    font-weight: 500;
    font-size: 0.9rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-meta {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .public-badge {
    background: var(--color-primary);
    color: white;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    font-size: 0.65rem;
    font-weight: 500;
  }

  .file-actions {
    display: flex;
    gap: 0.25rem;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .files-list li:hover .file-actions {
    opacity: 1;
  }

  .action-btn {
    padding: 0.375rem;
    background: transparent;
    border: none;
    color: var(--color-text-muted);
    border-radius: var(--radius);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .action-btn:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .action-btn.danger:hover {
    color: var(--color-error);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    padding: 2rem;
    text-align: center;
    color: var(--color-text-muted);
    gap: 1rem;
  }

  .empty-state svg {
    opacity: 0.5;
  }

  .empty-state p {
    font-size: 0.9rem;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error-toast {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    background: var(--color-error);
    color: white;
    padding: 0.75rem 1rem;
    border-radius: var(--radius);
    display: flex;
    align-items: center;
    gap: 0.75rem;
    animation: slideIn 0.3s ease;
    z-index: 1000;
  }

  .toast-close {
    background: transparent;
    border: none;
    color: white;
    font-size: 1.25rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
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

  /* Mobile styles */
  @media (max-width: 768px) {
    .files-app {
      height: calc(100vh - 120px);
    }

    .file-actions {
      opacity: 1;
    }

    .files-list li {
      padding: 0.75rem 1rem;
    }
  }
</style>

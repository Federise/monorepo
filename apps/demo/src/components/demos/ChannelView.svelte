<script lang="ts">
  import { LogClient, type LogEvent } from '@federise/sdk';
  import { onMount, onDestroy } from 'svelte';

  const USERNAME_KEY = 'federise-demo:chatUsername';

  interface Props {
    token: string;
  }

  let { token }: Props = $props();

  let client = $state<LogClient | null>(null);
  let messages = $state<LogEvent[]>([]);
  let newMessage = $state('');
  let username = $state(localStorage.getItem(USERNAME_KEY) || '');
  let isSending = $state(false);
  let isLoading = $state(true);
  let isRefreshing = $state(false);
  let error = $state<string | null>(null);
  let showUsernameModal = $state(false);
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  // Get channel name from URL path
  function getChannelName(): string {
    const path = window.location.pathname;
    const match = path.match(/^\/channel\/([^/]+)$/);
    return match ? match[1] : 'Shared Channel';
  }

  function initClient() {
    try {
      client = new LogClient({ token });
      error = null;
    } catch (err) {
      error = 'Invalid share link. The link may be expired or corrupted.';
      client = null;
    }
  }

  async function loadMessages(afterSeq?: number) {
    if (!client || !client.canRead) return;

    try {
      const result = await client.read(afterSeq, 100);
      if (afterSeq !== undefined) {
        messages = [...messages, ...result.events];
      } else {
        messages = result.events;
      }
      error = null;
    } catch (err) {
      if (err instanceof Error) {
        error = err.message;
      }
    }
  }

  async function refreshMessages() {
    if (!client || isRefreshing) return;
    isRefreshing = true;
    try {
      await loadMessages();
    } finally {
      isRefreshing = false;
    }
  }

  function startPolling() {
    stopPolling();
    pollInterval = setInterval(async () => {
      if (messages.length > 0) {
        const lastSeq = messages[messages.length - 1].seq;
        await loadMessages(lastSeq);
      } else {
        await loadMessages();
      }
    }, 3000);
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  async function sendMessage() {
    if (!newMessage.trim() || !client || !client.canWrite) return;

    isSending = true;
    try {
      const event = await client.append(newMessage.trim());
      messages = [...messages, event];
      newMessage = '';
      error = null;
    } catch (err) {
      if (err instanceof Error) {
        error = err.message;
      }
    } finally {
      isSending = false;
    }
  }

  function saveUsername() {
    localStorage.setItem(USERNAME_KEY, username);
    showUsernameModal = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  onMount(async () => {
    initClient();

    if (client) {
      isLoading = true;
      await loadMessages();
      isLoading = false;
      startPolling();
    } else {
      isLoading = false;
    }
  });

  onDestroy(() => {
    stopPolling();
  });
</script>

<div class="channel-view">
  {#if error && !client}
    <div class="error-state">
      <div class="error-icon">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      </div>
      <h2>Invalid Link</h2>
      <p>{error}</p>
      <a href="/" class="btn btn-primary btn-sm">Go to Demo</a>
    </div>
  {:else if client?.isExpired}
    <div class="error-state">
      <div class="error-icon">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </div>
      <h2>Link Expired</h2>
      <p>This share link has expired. Please ask the channel owner for a new link.</p>
      <a href="/" class="btn btn-primary btn-sm">Go to Demo</a>
    </div>
  {:else}
    <div class="channel-header">
      <div class="channel-info">
        <span class="channel-icon">#</span>
        <span class="channel-name">{getChannelName()}</span>
        {#if client?.canWrite}
          <span class="badge">Read & Write</span>
        {:else}
          <span class="badge readonly">Read Only</span>
        {/if}
      </div>
      <div class="channel-actions">
        <button class="icon-btn" onclick={() => showUsernameModal = true} title="Set username">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </button>
        <button class="icon-btn" onclick={refreshMessages} disabled={isRefreshing} title="Refresh">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class:spinning={isRefreshing}>
            <path d="M23 4v6h-6M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>
    </div>

    <div class="messages">
      {#if isLoading}
        <div class="loading">
          <div class="spinner"></div>
          <p>Loading messages...</p>
        </div>
      {:else if messages.length === 0}
        <div class="empty-state">
          <p>No messages yet. {client?.canWrite ? 'Start the conversation!' : 'Waiting for messages...'}</p>
        </div>
      {:else}
        {#each messages as message}
          <div class="message" class:own={message.authorId === client?.authorId}>
            <span class="author">{message.authorId === client?.authorId ? (username || 'You') : message.authorId.slice(0, 8)}</span>
            <span class="content">{message.content}</span>
            <span class="time">{new Date(message.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
          </div>
        {/each}
      {/if}
    </div>

    {#if error}
      <div class="error-banner">{error}</div>
    {/if}

    {#if client?.canWrite}
      <div class="message-input">
        <input
          type="text"
          placeholder={username ? `Message as ${username}...` : 'Type a message...'}
          bind:value={newMessage}
          onkeydown={handleKeydown}
          disabled={isSending}
        />
        <button class="btn btn-primary btn-sm" onclick={sendMessage} disabled={isSending || !newMessage.trim()}>
          {isSending ? '...' : 'Send'}
        </button>
      </div>
    {:else}
      <div class="readonly-notice">
        <p>You have read-only access to this channel</p>
      </div>
    {/if}
  {/if}
</div>

{#if showUsernameModal}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="modal-overlay" onclick={() => showUsernameModal = false} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
      <h3>Set Username</h3>
      <p>Choose a display name for your messages:</p>
      <input
        type="text"
        placeholder="Enter username"
        bind:value={username}
        onkeydown={(e) => e.key === 'Enter' && saveUsername()}
        class="username-input"
      />
      <div class="modal-actions">
        <button class="btn btn-secondary btn-sm" onclick={() => showUsernameModal = false}>Cancel</button>
        <button class="btn btn-primary btn-sm" onclick={saveUsername}>Save</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .channel-view {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 120px);
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
    overflow: hidden;
  }

  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 2rem;
    text-align: center;
  }

  .error-icon {
    color: var(--color-text-muted);
    margin-bottom: 1rem;
  }

  .error-state h2 {
    margin: 0 0 0.5rem;
    font-size: 1.1rem;
  }

  .error-state p {
    color: var(--color-text-muted);
    margin-bottom: 1rem;
    font-size: 0.85rem;
  }

  .channel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.625rem 0.75rem;
    border-bottom: 1px solid var(--color-border);
  }

  .channel-info {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-weight: 600;
    font-size: 0.9rem;
  }

  .channel-icon {
    opacity: 0.7;
    font-size: 0.85rem;
  }

  .channel-actions {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .badge {
    font-size: 0.65rem;
    font-weight: 500;
    padding: 0.15rem 0.4rem;
    background: var(--color-success, #22c55e);
    color: white;
    border-radius: 999px;
  }

  .badge.readonly {
    background: var(--color-text-muted);
  }

  .icon-btn {
    padding: 0.25rem;
    background: transparent;
    border: none;
    color: var(--color-text-muted);
    border-radius: var(--radius);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .icon-btn:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .icon-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .spinning {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .loading,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--color-text-muted);
    font-size: 0.85rem;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    margin-bottom: 0.75rem;
    animation: spin 0.8s linear infinite;
  }

  .message {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.85rem;
    border-radius: var(--radius);
  }

  .message:hover {
    background: var(--color-bg);
  }

  .message.own .author {
    color: var(--color-success, #22c55e);
  }

  .author {
    font-weight: 600;
    color: var(--color-primary);
    font-size: 0.8rem;
    flex-shrink: 0;
  }

  .content {
    flex: 1;
    word-break: break-word;
  }

  .time {
    font-size: 0.7rem;
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  .error-banner {
    padding: 0.5rem 0.75rem;
    background: var(--color-error, #ef4444);
    color: white;
    font-size: 0.8rem;
  }

  .message-input {
    display: flex;
    gap: 0.5rem;
    padding: 0.5rem;
    border-top: 1px solid var(--color-border);
  }

  .message-input input {
    flex: 1;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-bg);
    color: var(--color-text);
    font-size: 0.85rem;
  }

  .btn-sm {
    padding: 0.375rem 0.625rem;
    font-size: 0.8rem;
  }

  .readonly-notice {
    padding: 0.5rem 0.75rem;
    background: var(--color-bg);
    border-top: 1px solid var(--color-border);
    text-align: center;
    color: var(--color-text-muted);
    font-size: 0.8rem;
  }

  .readonly-notice p {
    margin: 0;
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    padding: 1.25rem;
    max-width: 350px;
    width: 90%;
  }

  .modal h3 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
  }

  .modal p {
    color: var(--color-text-muted);
    margin-bottom: 0.75rem;
    font-size: 0.85rem;
  }

  .username-input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-bg);
    color: var(--color-text);
    font-size: 0.85rem;
    margin-bottom: 0.75rem;
  }

  .modal-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  @media (max-width: 768px) {
    .channel-view {
      height: calc(100vh - 80px);
    }
  }
</style>

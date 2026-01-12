<script lang="ts">
  import { LogClient, type LogEvent } from '@federise/sdk';
  import { onMount, onDestroy } from 'svelte';

  interface Props {
    token: string;
  }

  let { token }: Props = $props();

  let client = $state<LogClient | null>(null);
  let messages = $state<LogEvent[]>([]);
  let newMessage = $state('');
  let isSending = $state(false);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let pollInterval: ReturnType<typeof setInterval> | null = null;

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
        // Append new messages
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
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      </div>
      <h2>Invalid Link</h2>
      <p>{error}</p>
      <a href="/" class="btn btn-primary">Go to Demo</a>
    </div>
  {:else if client?.isExpired}
    <div class="error-state">
      <div class="error-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </div>
      <h2>Link Expired</h2>
      <p>This share link has expired. Please ask the channel owner for a new link.</p>
      <a href="/" class="btn btn-primary">Go to Demo</a>
    </div>
  {:else}
    <div class="channel-header">
      <div class="channel-info">
        <span class="channel-icon">#</span>
        <span class="channel-name">Shared Channel</span>
        {#if client?.canWrite}
          <span class="badge">Read & Write</span>
        {:else}
          <span class="badge readonly">Read Only</span>
        {/if}
      </div>
      {#if client}
        <span class="expires">Expires {client.expiresAt.toLocaleDateString()}</span>
      {/if}
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
            <div class="message-header">
              <span class="author">
                {message.authorId === client?.authorId ? 'You' : message.authorId.slice(0, 12)}
              </span>
              <span class="time">{new Date(message.createdAt).toLocaleTimeString()}</span>
            </div>
            <div class="message-content">{message.content}</div>
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
          placeholder="Type a message..."
          bind:value={newMessage}
          onkeydown={handleKeydown}
          disabled={isSending}
        />
        <button class="btn btn-primary" onclick={sendMessage} disabled={isSending || !newMessage.trim()}>
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
  }

  .error-state p {
    color: var(--color-text-muted);
    margin-bottom: 1.5rem;
  }

  .channel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    border-bottom: 1px solid var(--color-border);
  }

  .channel-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
  }

  .channel-icon {
    opacity: 0.7;
  }

  .badge {
    font-size: 0.7rem;
    font-weight: 500;
    padding: 0.2rem 0.5rem;
    background: var(--color-success, #22c55e);
    color: white;
    border-radius: 999px;
  }

  .badge.readonly {
    background: var(--color-text-muted);
  }

  .expires {
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .loading,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--color-text-muted);
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    margin-bottom: 1rem;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .message {
    padding: 0.75rem;
    background: var(--color-bg);
    border-radius: var(--radius);
  }

  .message.own {
    background: var(--color-primary);
    color: white;
    margin-left: 2rem;
  }

  .message.own .author,
  .message.own .time {
    color: rgba(255, 255, 255, 0.8);
  }

  .message-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.25rem;
  }

  .author {
    font-weight: 600;
    font-size: 0.85rem;
  }

  .time {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .message-content {
    white-space: pre-wrap;
    word-break: break-word;
  }

  .error-banner {
    padding: 0.75rem 1rem;
    background: var(--color-error, #ef4444);
    color: white;
    font-size: 0.85rem;
  }

  .message-input {
    display: flex;
    gap: 0.5rem;
    padding: 1rem;
    border-top: 1px solid var(--color-border);
  }

  .message-input input {
    flex: 1;
    padding: 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-bg);
    color: var(--color-text);
  }

  .readonly-notice {
    padding: 0.75rem 1rem;
    background: var(--color-bg);
    border-top: 1px solid var(--color-border);
    text-align: center;
    color: var(--color-text-muted);
    font-size: 0.85rem;
  }

  .readonly-notice p {
    margin: 0;
  }

  /* Mobile styles */
  @media (max-width: 768px) {
    .channel-view {
      height: calc(100vh - 80px);
    }

    .channel-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }
  }
</style>

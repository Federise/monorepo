<script lang="ts">
  import { LogClient, type LogEvent } from '@federise/sdk';
  import { onMount, onDestroy } from 'svelte';
  import { parseMetaMessage } from '../../lib/chat-utils';
  import MessageList from '../chat/MessageList.svelte';
  import MessageInput from '../chat/MessageInput.svelte';
  import UsernameModal from '../chat/UsernameModal.svelte';

  const USERNAME_KEY = 'federise-demo:chatUsername';

  interface Props {
    token: string;
    gatewayUrl: string | null;
  }

  let { token, gatewayUrl }: Props = $props();

  let client = $state<LogClient | null>(null);
  let messages = $state<LogEvent[]>([]);
  let channelName = $state<string>('Channel');
  let newMessage = $state('');
  let username = $state(localStorage.getItem(USERNAME_KEY) || '');
  let isSending = $state(false);
  let isLoading = $state(true);
  let isRefreshing = $state(false);
  let error = $state<string | null>(null);
  let showUsernameModal = $state(false);
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  function initClient() {
    try {
      // Pass gateway URL from share link (required for connecting to correct gateway)
      client = new LogClient({ token, gatewayUrl: gatewayUrl || undefined });
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
        // Deduplicate by event ID to prevent duplicates from race conditions
        const existingIds = new Set(messages.map(m => m.id));
        const newEvents = result.events.filter(e => !existingIds.has(e.id));
        if (newEvents.length > 0) {
          messages = [...messages, ...newEvents];
        }
      } else {
        messages = result.events;
        // Extract channel name from first meta message
        for (const msg of result.events) {
          const meta = parseMetaMessage(msg.content);
          if (meta?.name) {
            channelName = meta.name;
            break;
          }
        }
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
      // Include username in message content
      const messageContent = JSON.stringify({
        type: '__chat__',
        author: username || 'Anonymous',
        text: newMessage.trim(),
      });
      const event = await client.append(messageContent);
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
    </div>
  {:else}
    <div class="channel-header">
      <div class="channel-info">
        <span class="channel-icon">#</span>
        <span class="channel-name">{channelName}</span>
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

    <MessageList
      {messages}
      {isLoading}
      emptyMessage={client?.canWrite ? 'No messages yet. Start the conversation!' : 'No messages yet. Waiting for messages...'}
    />

    {#if error}
      <div class="error-banner">{error}</div>
    {/if}

    {#if client?.canWrite}
      <MessageInput
        bind:value={newMessage}
        placeholder={username ? `Message as ${username}...` : 'Type a message...'}
        {isSending}
        onSend={sendMessage}
      />
    {:else}
      <div class="readonly-notice">
        <p>You have read-only access to this channel</p>
      </div>
    {/if}
  {/if}
</div>

<UsernameModal bind:show={showUsernameModal} bind:username onSave={saveUsername} onCancel={() => {}} />

<style>
  .channel-view {
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh; /* Dynamic viewport height for mobile */
    background: var(--color-bg);
    overflow: hidden;
    position: fixed;
    inset: 0;
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
    margin-bottom: 1.5rem;
  }

  .error-state h2 {
    margin: 0 0 0.75rem;
    font-size: 1.25rem;
  }

  .error-state p {
    color: var(--color-text-muted);
    font-size: 0.9rem;
    max-width: 300px;
  }

  .channel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
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

  .error-banner {
    padding: 0.5rem 0.75rem;
    background: var(--color-error, #ef4444);
    color: white;
    font-size: 0.8rem;
    flex-shrink: 0;
  }

  .readonly-notice {
    padding: 0.75rem 1rem;
    background: var(--color-surface);
    border-top: 1px solid var(--color-border);
    text-align: center;
    color: var(--color-text-muted);
    font-size: 0.8rem;
    flex-shrink: 0;
  }

  .readonly-notice p {
    margin: 0;
  }
</style>

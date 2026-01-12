<script lang="ts">
  import { getClient } from '../../stores/federise.svelte';
  import { onMount, onDestroy } from 'svelte';
  import type { LogMeta, LogEvent } from '@federise/sdk';

  const LAST_CHANNEL_KEY = 'federise-demo:lastChannel';
  const USERNAME_KEY = 'federise-demo:chatUsername';

  interface Channel extends LogMeta {
    secret?: string;
  }

  let channels = $state<Channel[]>([]);
  let selectedChannel = $state<Channel | null>(null);
  let messages = $state<LogEvent[]>([]);
  let newMessage = $state('');
  let newChannelName = $state('');
  let username = $state(localStorage.getItem(USERNAME_KEY) || '');
  let isCreating = $state(false);
  let isSending = $state(false);
  let isLoading = $state(false);
  let isRefreshing = $state(false);
  let shareUrl = $state<string | null>(null);
  let showShareModal = $state(false);
  let showUsernameModal = $state(false);
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  // Generate a short random slug
  function generateSlug(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let slug = '';
    for (let i = 0; i < 8; i++) {
      slug += chars[Math.floor(Math.random() * chars.length)];
    }
    return slug;
  }

  // Get display name for an author
  function getAuthorName(authorId: string): string {
    // Check if it's our own message
    const client = getClient();
    if (client) {
      const caps = client.getGrantedCapabilities();
      // For now, just show username if set, otherwise truncated ID
    }
    return authorId.slice(0, 8);
  }

  async function loadChannels() {
    const client = getClient();
    if (!client) return;

    try {
      const result = await client.log.list();
      channels = result;

      // Restore last selected channel
      const lastChannelId = localStorage.getItem(LAST_CHANNEL_KEY);
      if (lastChannelId && !selectedChannel) {
        const lastChannel = channels.find(c => c.logId === lastChannelId);
        if (lastChannel) {
          selectChannel(lastChannel);
        }
      }
    } catch (err) {
      console.error('Failed to load channels:', err);
    }
  }

  async function createChannel() {
    if (!newChannelName.trim()) return;

    const client = getClient();
    if (!client) return;

    isCreating = true;
    try {
      const result = await client.log.create(newChannelName.trim());
      channels = [...channels, { ...result.metadata, secret: result.secret }];
      newChannelName = '';
      selectChannel({ ...result.metadata, secret: result.secret });
    } catch (err) {
      console.error('Failed to create channel:', err);
    } finally {
      isCreating = false;
    }
  }

  async function selectChannel(channel: Channel) {
    selectedChannel = channel;
    localStorage.setItem(LAST_CHANNEL_KEY, channel.logId);
    messages = [];
    isLoading = true;

    try {
      await loadMessages();
    } finally {
      isLoading = false;
    }

    startPolling();
  }

  async function loadMessages(afterSeq?: number) {
    if (!selectedChannel) return;

    const client = getClient();
    if (!client) return;

    try {
      const result = await client.log.read(selectedChannel.logId, afterSeq, 100);
      if (afterSeq !== undefined) {
        messages = [...messages, ...result.events];
      } else {
        messages = result.events;
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  }

  async function refreshMessages() {
    if (!selectedChannel || isRefreshing) return;
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
    if (!newMessage.trim() || !selectedChannel) return;

    const client = getClient();
    if (!client) return;

    isSending = true;
    try {
      const event = await client.log.append(selectedChannel.logId, newMessage.trim());
      messages = [...messages, event];
      newMessage = '';
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      isSending = false;
    }
  }

  async function shareChannel() {
    if (!selectedChannel) return;

    const client = getClient();
    if (!client) return;

    try {
      const result = await client.log.createToken(
        selectedChannel.logId,
        ['read', 'write'],
        7 * 24 * 60 * 60
      );

      const baseUrl = window.location.origin;
      const slug = generateSlug();
      shareUrl = `${baseUrl}/channel/${slug}#${result.token}`;
      showShareModal = true;
    } catch (err) {
      console.error('Failed to create share link:', err);
    }
  }

  function copyShareUrl() {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
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

  onMount(() => {
    loadChannels();
  });

  onDestroy(() => {
    stopPolling();
  });
</script>

<div class="chat-container">
  <div class="channel-list">
    <div class="channel-header">
      <h3>Channels</h3>
      <button class="icon-btn" onclick={() => showUsernameModal = true} title="Set username">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </button>
    </div>

    <div class="channel-items">
      {#each channels as channel}
        <button
          class="channel-item"
          class:active={selectedChannel?.logId === channel.logId}
          onclick={() => selectChannel(channel)}
        >
          <span class="channel-icon">#</span>
          <span class="channel-name">{channel.name}</span>
        </button>
      {/each}
    </div>

    <div class="create-channel">
      <input
        type="text"
        placeholder="New channel name"
        bind:value={newChannelName}
        onkeydown={(e) => e.key === 'Enter' && createChannel()}
      />
      <button class="btn btn-primary btn-sm" onclick={createChannel} disabled={isCreating || !newChannelName.trim()}>
        {isCreating ? '...' : '+'}
      </button>
    </div>
  </div>

  <div class="chat-main">
    {#if selectedChannel}
      <div class="chat-header">
        <div class="chat-header-info">
          <span class="channel-icon">#</span>
          <span class="channel-name">{selectedChannel.name}</span>
        </div>
        <div class="chat-header-actions">
          <button class="icon-btn" onclick={refreshMessages} disabled={isRefreshing} title="Refresh">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class:spinning={isRefreshing}>
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
          <button class="btn btn-secondary btn-sm" onclick={shareChannel}>Share</button>
        </div>
      </div>

      <div class="messages">
        {#if isLoading}
          <div class="loading">Loading messages...</div>
        {:else if messages.length === 0}
          <div class="empty-state">
            <p>No messages yet. Start the conversation!</p>
          </div>
        {:else}
          {#each messages as message}
            <div class="message">
              <span class="author">{message.authorId.slice(0, 8)}</span>
              <span class="content">{message.content}</span>
              <span class="time">{new Date(message.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            </div>
          {/each}
        {/if}
      </div>

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
      <div class="no-channel">
        <p>Select a channel or create a new one to start chatting</p>
      </div>
    {/if}
  </div>
</div>

{#if showShareModal}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="modal-overlay" onclick={() => showShareModal = false} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
      <h3>Share Channel</h3>
      <p>Anyone with this link can read and write to this channel:</p>
      <div class="share-url">
        <input type="text" readonly value={shareUrl} />
        <button class="btn btn-primary btn-sm" onclick={copyShareUrl}>Copy</button>
      </div>
      <p class="share-note">Link expires in 7 days</p>
      <button class="btn btn-secondary btn-sm" onclick={() => showShareModal = false}>Close</button>
    </div>
  </div>
{/if}

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
  .chat-container {
    display: flex;
    height: calc(100vh - 120px);
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
    overflow: hidden;
  }

  .channel-list {
    width: 200px;
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    background: var(--color-bg);
  }

  .channel-header {
    padding: 0.75rem;
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .channel-header h3 {
    margin: 0;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
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

  .channel-items {
    flex: 1;
    overflow-y: auto;
    padding: 0.25rem;
  }

  .channel-item {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    width: 100%;
    padding: 0.375rem 0.5rem;
    background: transparent;
    border: none;
    border-radius: var(--radius);
    color: var(--color-text-muted);
    text-align: left;
    cursor: pointer;
    transition: all 0.15s;
    font-size: 0.85rem;
  }

  .channel-item:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .channel-item.active {
    background: var(--color-primary);
    color: white;
  }

  .channel-icon {
    font-weight: 600;
    opacity: 0.7;
    font-size: 0.8rem;
  }

  .channel-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .create-channel {
    display: flex;
    gap: 0.375rem;
    padding: 0.5rem;
    border-top: 1px solid var(--color-border);
  }

  .create-channel input {
    flex: 1;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-surface);
    color: var(--color-text);
    font-size: 0.8rem;
  }

  .btn-sm {
    padding: 0.375rem 0.625rem;
    font-size: 0.8rem;
  }

  .chat-main {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.625rem 0.75rem;
    border-bottom: 1px solid var(--color-border);
  }

  .chat-header-info {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-weight: 600;
    font-size: 0.9rem;
  }

  .chat-header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
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
  .empty-state,
  .no-channel {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--color-text-muted);
    font-size: 0.85rem;
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
    max-width: 400px;
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

  .share-url {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .share-url input {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-bg);
    color: var(--color-text);
    font-size: 0.8rem;
  }

  .share-note {
    font-size: 0.75rem;
    margin-bottom: 0.75rem;
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
    .chat-container {
      height: calc(100vh - 80px);
      flex-direction: column;
    }

    .channel-list {
      width: 100%;
      height: auto;
      max-height: 150px;
      border-right: none;
      border-bottom: 1px solid var(--color-border);
    }
  }
</style>

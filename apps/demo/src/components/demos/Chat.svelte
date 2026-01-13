<script lang="ts">
  import { getClient, hasLogDeletePermissions } from '../../stores/federise.svelte';
  import { onMount, onDestroy } from 'svelte';
  import type { LogMeta, LogEvent } from '@federise/sdk';
  import MessageList from '../chat/MessageList.svelte';
  import MessageInput from '../chat/MessageInput.svelte';
  import UsernameModal from '../chat/UsernameModal.svelte';

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
  let showDeleteModal = $state(false);
  let isDeleting = $state(false);
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  // Convert a string to kebab-case
  function toKebabCase(str: string): string {
    return str
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
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

    const channelName = toKebabCase(newChannelName);

    isCreating = true;
    try {
      // Create the log (using a random ID internally)
      const result = await client.log.create(channelName);

      // Store channel name as first message (meta entry)
      await client.log.append(result.metadata.logId, JSON.stringify({
        type: '__meta__',
        name: channelName,
      }));

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
        // Deduplicate by event ID to prevent duplicates from race conditions
        const existingIds = new Set(messages.map(m => m.id));
        const newEvents = result.events.filter(e => !existingIds.has(e.id));
        if (newEvents.length > 0) {
          messages = [...messages, ...newEvents];
        }
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
      // Include username in message content
      const messageContent = JSON.stringify({
        type: '__chat__',
        author: username || 'Anonymous',
        text: newMessage.trim(),
      });
      const event = await client.log.append(selectedChannel.logId, messageContent);
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
      // Include both token and gateway URL in the share link
      // Format: #<token>@<base64urlGatewayUrl>
      const base64Gateway = btoa(result.gatewayUrl)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      shareUrl = `${baseUrl}/channel#${result.token}@${base64Gateway}`;
      showShareModal = true;
    } catch (err) {
      console.error('Failed to create share link:', err);
    }
  }

  async function deleteChannel() {
    if (!selectedChannel) return;

    const client = getClient();
    if (!client) return;

    isDeleting = true;
    try {
      await client.log.delete(selectedChannel.logId);
      // Remove from local list
      channels = channels.filter(c => c.logId !== selectedChannel.logId);
      // Clear selection
      localStorage.removeItem(LAST_CHANNEL_KEY);
      selectedChannel = null;
      messages = [];
      stopPolling();
      showDeleteModal = false;
    } catch (err) {
      console.error('Failed to delete channel:', err);
    } finally {
      isDeleting = false;
    }
  }

  function copyShareUrl() {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
    }
  }

  function saveUsername() {
    localStorage.setItem(USERNAME_KEY, username);
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
          {#if hasLogDeletePermissions()}
            <button class="btn btn-danger btn-sm" onclick={() => showDeleteModal = true}>Delete</button>
          {/if}
        </div>
      </div>

      <MessageList {messages} {isLoading} emptyMessage="No messages yet. Start the conversation!" />

      <MessageInput
        bind:value={newMessage}
        placeholder={username ? `Message as ${username}...` : 'Type a message...'}
        {isSending}
        onSend={sendMessage}
      />
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

<UsernameModal bind:show={showUsernameModal} bind:username onSave={saveUsername} onCancel={() => {}} />

{#if showDeleteModal && selectedChannel}
  <div class="modal-overlay" role="presentation">
    <div class="modal" role="dialog" aria-modal="true" tabindex="-1">
      <h3>Delete Channel</h3>
      <p>Are you sure you want to delete <strong>#{selectedChannel.name}</strong>? This will permanently delete all messages and cannot be undone.</p>
      <div class="modal-actions">
        <button class="btn btn-secondary btn-sm" onclick={() => showDeleteModal = false} disabled={isDeleting}>Cancel</button>
        <button class="btn btn-danger btn-sm" onclick={deleteChannel} disabled={isDeleting}>
          {isDeleting ? 'Deleting...' : 'Delete'}
        </button>
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
    overflow: hidden;
  }

  .create-channel input {
    flex: 1;
    min-width: 0;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-surface);
    color: var(--color-text);
    font-size: 0.8rem;
  }

  .create-channel button {
    flex-shrink: 0;
  }

  .btn-sm {
    padding: 0.375rem 0.625rem;
    font-size: 0.8rem;
  }

  .btn-danger {
    background: var(--color-error, #ef4444);
    color: white;
    border: none;
  }

  .btn-danger:hover:not(:disabled) {
    background: #dc2626;
  }

  .btn-danger:disabled {
    opacity: 0.6;
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

  .no-channel {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--color-text-muted);
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

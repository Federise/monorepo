<script lang="ts">
  import { getClient } from '../../stores/federise.svelte';
  import { onMount, onDestroy } from 'svelte';
  import type { LogMeta, LogEvent } from '@federise/sdk';

  interface Channel extends LogMeta {
    secret?: string;
  }

  let channels = $state<Channel[]>([]);
  let selectedChannel = $state<Channel | null>(null);
  let messages = $state<LogEvent[]>([]);
  let newMessage = $state('');
  let newChannelName = $state('');
  let isCreating = $state(false);
  let isSending = $state(false);
  let isLoading = $state(false);
  let shareUrl = $state<string | null>(null);
  let showShareModal = $state(false);
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  async function loadChannels() {
    const client = getClient();
    if (!client) return;

    try {
      const result = await client.log.list();
      channels = result;
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
    messages = [];
    isLoading = true;

    try {
      await loadMessages();
    } finally {
      isLoading = false;
    }

    // Start polling
    startPolling();
  }

  async function loadMessages(afterSeq?: number) {
    if (!selectedChannel) return;

    const client = getClient();
    if (!client) return;

    try {
      const result = await client.log.read(selectedChannel.logId, afterSeq, 100);
      if (afterSeq !== undefined) {
        // Append new messages
        messages = [...messages, ...result.events];
      } else {
        messages = result.events;
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
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
      // Create a token with read and write permissions, expires in 7 days
      const result = await client.log.createToken(
        selectedChannel.logId,
        ['read', 'write'],
        7 * 24 * 60 * 60
      );

      // Create share URL using current origin
      const baseUrl = window.location.origin;
      const slug = selectedChannel.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
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
      <button class="btn btn-primary" onclick={createChannel} disabled={isCreating || !newChannelName.trim()}>
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
        <button class="btn btn-secondary" onclick={shareChannel}>
          Share
        </button>
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
              <div class="message-header">
                <span class="author">{message.authorId.slice(0, 12)}</span>
                <span class="time">{new Date(message.createdAt).toLocaleTimeString()}</span>
              </div>
              <div class="message-content">{message.content}</div>
            </div>
          {/each}
        {/if}
      </div>

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
        <button class="btn btn-primary" onclick={copyShareUrl}>Copy</button>
      </div>
      <p class="share-note">Link expires in 7 days</p>
      <button class="btn btn-secondary" onclick={() => showShareModal = false}>Close</button>
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
    width: 240px;
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    background: var(--color-bg);
  }

  .channel-header {
    padding: 1rem;
    border-bottom: 1px solid var(--color-border);
  }

  .channel-header h3 {
    margin: 0;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
  }

  .channel-items {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .channel-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: none;
    border-radius: var(--radius);
    color: var(--color-text-muted);
    text-align: left;
    cursor: pointer;
    transition: all 0.15s;
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
  }

  .channel-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .create-channel {
    display: flex;
    gap: 0.5rem;
    padding: 0.75rem;
    border-top: 1px solid var(--color-border);
  }

  .create-channel input {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-surface);
    color: var(--color-text);
    font-size: 0.85rem;
  }

  .create-channel button {
    padding: 0.5rem 0.75rem;
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
    padding: 1rem;
    border-bottom: 1px solid var(--color-border);
  }

  .chat-header-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
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
  .empty-state,
  .no-channel {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--color-text-muted);
  }

  .message {
    padding: 0.75rem;
    background: var(--color-bg);
    border-radius: var(--radius);
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
    padding: 1.5rem;
    max-width: 500px;
    width: 90%;
  }

  .modal h3 {
    margin: 0 0 0.5rem;
  }

  .modal p {
    color: var(--color-text-muted);
    margin-bottom: 1rem;
  }

  .share-url {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .share-url input {
    flex: 1;
    padding: 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-bg);
    color: var(--color-text);
    font-size: 0.85rem;
  }

  .share-note {
    font-size: 0.8rem;
    margin-bottom: 1rem;
  }

  /* Mobile styles */
  @media (max-width: 768px) {
    .chat-container {
      height: calc(100vh - 80px);
      flex-direction: column;
    }

    .channel-list {
      width: 100%;
      height: auto;
      max-height: 200px;
      border-right: none;
      border-bottom: 1px solid var(--color-border);
    }
  }
</style>

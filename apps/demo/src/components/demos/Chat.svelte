<script lang="ts">
  import { getClient, hasChannelDeletePermissions } from '../../stores/federise.svelte';
  import { onMount, onDestroy } from 'svelte';
  import type { ChannelMeta, ChannelEvent } from '@federise/sdk';
  import MessageList from '../chat/MessageList.svelte';
  import MessageInput from '../chat/MessageInput.svelte';
  import UsernameModal from '../chat/UsernameModal.svelte';

  const LAST_CHANNEL_KEY = 'federise-demo:lastChannel';
  const USERNAME_KEY = 'federise-demo:chatUsername';

  interface Channel extends ChannelMeta {
    secret?: string;
  }

  let channels = $state<Channel[]>([]);
  let selectedChannel = $state<Channel | null>(null);
  let messages = $state<ChannelEvent[]>([]);
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
  let isGeneratingLink = $state(false);
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  // Share modal state
  let shareDisplayName = $state('');
  let sharePermRead = $state(true);
  let sharePermAppend = $state(true);
  let sharePermDeleteOwn = $state(false);
  let sharePermDeleteAny = $state(false);
  let sharePermReadDeleted = $state(false);
  let shareExpiryDays = $state(7); // Default 7 days

  // Expiry options
  const expiryOptions = [
    { value: 1, label: '1 day' },
    { value: 7, label: '7 days' },
    { value: 30, label: '30 days' },
    { value: 90, label: '90 days' },
    { value: 365, label: '1 year' },
  ];

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
      const result = await client.channel.list();
      channels = result;

      // Restore last selected channel
      const lastChannelId = localStorage.getItem(LAST_CHANNEL_KEY);
      if (lastChannelId && !selectedChannel) {
        const lastChannel = channels.find(c => c.channelId === lastChannelId);
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
      // Create the channel (using a random ID internally)
      const result = await client.channel.create(channelName);

      // Store channel name as first message (meta entry)
      await client.channel.append(result.metadata.channelId, JSON.stringify({
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
    localStorage.setItem(LAST_CHANNEL_KEY, channel.channelId);
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
      const result = await client.channel.read(selectedChannel.channelId, afterSeq, 100);
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
      const event = await client.channel.append(selectedChannel.channelId, messageContent);
      messages = [...messages, event];
      newMessage = '';
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      isSending = false;
    }
  }

  function openShareModal() {
    if (!selectedChannel) return;
    // Reset share modal state
    shareUrl = null;
    shareDisplayName = '';
    sharePermRead = true;
    sharePermAppend = true;
    sharePermDeleteOwn = false;
    sharePermDeleteAny = false;
    sharePermReadDeleted = false;
    shareExpiryDays = 7;
    showShareModal = true;
  }

  async function generateShareLink() {
    if (!selectedChannel) return;

    const client = getClient();
    if (!client) return;

    // Build permissions array from toggles
    const permissions: string[] = [];
    if (sharePermRead) permissions.push('read');
    if (sharePermAppend) permissions.push('append');
    if (sharePermDeleteOwn) permissions.push('delete:own');
    if (sharePermDeleteAny) permissions.push('delete:any');
    if (sharePermReadDeleted) permissions.push('read:deleted');

    if (permissions.length === 0) {
      alert('Please select at least one permission');
      return;
    }

    isGeneratingLink = true;
    try {
      const result = await client.channel.createToken(
        selectedChannel.channelId,
        permissions,
        {
          expiresInSeconds: shareExpiryDays * 24 * 60 * 60,
          displayName: shareDisplayName.trim() || undefined,
        }
      );

      const baseUrl = window.location.origin;
      // Include both token and gateway URL in the share link
      // Format: #<token>@<base64urlGatewayUrl>
      const base64Gateway = btoa(result.gatewayUrl)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      shareUrl = `${baseUrl}/channel#${result.token}@${base64Gateway}`;
    } catch (err) {
      console.error('Failed to create share link:', err);
    } finally {
      isGeneratingLink = false;
    }
  }

  async function deleteChannel() {
    if (!selectedChannel) return;

    const client = getClient();
    if (!client) return;

    isDeleting = true;
    try {
      await client.channel.delete(selectedChannel.channelId);
      // Remove from local list
      channels = channels.filter(c => c.channelId !== selectedChannel.channelId);
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

  async function deleteMessage(message: import('@federise/sdk').ChannelEvent) {
    if (!selectedChannel) return;

    const client = getClient();
    if (!client) return;

    try {
      await client.channel.deleteEvent(selectedChannel.channelId, message.seq);
      // Mark as deleted locally
      messages = messages.map(m =>
        m.seq === message.seq ? { ...m, deleted: true } : m
      );
    } catch (err) {
      console.error('Failed to delete message:', err);
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
          class:active={selectedChannel?.channelId === channel.channelId}
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
          <button class="btn btn-secondary btn-sm" onclick={openShareModal}>Share</button>
          {#if hasChannelDeletePermissions()}
            <button class="btn btn-danger btn-sm" onclick={() => showDeleteModal = true}>Delete</button>
          {/if}
        </div>
      </div>

      <MessageList
        {messages}
        {isLoading}
        emptyMessage="No messages yet. Start the conversation!"
        canDeleteAny={true}
        currentAuthorId="Owner"
        onDelete={deleteMessage}
      />

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
    <div class="modal share-modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
      <h3>Share Channel</h3>

      {#if !shareUrl}
        <div class="share-config">
          <div class="form-group">
            <label for="share-display-name">Display Name (optional)</label>
            <input
              id="share-display-name"
              type="text"
              placeholder="e.g., Alice, Bob, Guest"
              bind:value={shareDisplayName}
              maxlength="32"
            />
            <p class="field-hint">Shown as the author when they send messages</p>
          </div>

          <div class="form-group">
            <span class="form-label">Permissions</span>
            <div class="permission-toggles">
              <label class="permission-toggle">
                <input type="checkbox" bind:checked={sharePermRead} />
                <span class="toggle-label">
                  <span class="toggle-name">Read</span>
                  <span class="toggle-desc">View messages in the channel</span>
                </span>
              </label>

              <label class="permission-toggle">
                <input type="checkbox" bind:checked={sharePermAppend} />
                <span class="toggle-label">
                  <span class="toggle-name">Send Messages</span>
                  <span class="toggle-desc">Post new messages to the channel</span>
                </span>
              </label>

              <label class="permission-toggle">
                <input type="checkbox" bind:checked={sharePermDeleteOwn} disabled={sharePermDeleteAny} />
                <span class="toggle-label">
                  <span class="toggle-name">Delete Own</span>
                  <span class="toggle-desc">Delete their own messages</span>
                </span>
              </label>

              <label class="permission-toggle">
                <input type="checkbox" bind:checked={sharePermDeleteAny} onchange={() => { if (sharePermDeleteAny) sharePermDeleteOwn = false; }} />
                <span class="toggle-label">
                  <span class="toggle-name">Delete Any</span>
                  <span class="toggle-desc">Delete any message (moderator)</span>
                </span>
              </label>

              <label class="permission-toggle">
                <input type="checkbox" bind:checked={sharePermReadDeleted} />
                <span class="toggle-label">
                  <span class="toggle-name">See Deleted</span>
                  <span class="toggle-desc">View soft-deleted messages</span>
                </span>
              </label>
            </div>
          </div>

          <div class="form-group">
            <label for="share-expiry">Link Expires In</label>
            <select id="share-expiry" bind:value={shareExpiryDays}>
              {#each expiryOptions as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary btn-sm" onclick={() => showShareModal = false}>Cancel</button>
            <button class="btn btn-primary btn-sm" onclick={generateShareLink} disabled={isGeneratingLink}>
              {isGeneratingLink ? 'Generating...' : 'Generate Link'}
            </button>
          </div>
        </div>
      {:else}
        <div class="share-result">
          <p>Share this link to grant access:</p>

          <div class="permission-badges">
            {#if sharePermRead}<span class="badge">Read</span>{/if}
            {#if sharePermAppend}<span class="badge">Send</span>{/if}
            {#if sharePermDeleteOwn}<span class="badge">Delete Own</span>{/if}
            {#if sharePermDeleteAny}<span class="badge badge-warn">Delete Any</span>{/if}
            {#if sharePermReadDeleted}<span class="badge">See Deleted</span>{/if}
          </div>

          {#if shareDisplayName}
            <p class="display-name-note">Messages will appear from: <strong>{shareDisplayName}</strong></p>
          {/if}

          <div class="share-url">
            <input type="text" readonly value={shareUrl} />
            <button class="btn btn-primary btn-sm" onclick={copyShareUrl}>Copy</button>
          </div>

          <p class="share-note">Link expires in {expiryOptions.find(o => o.value === shareExpiryDays)?.label || `${shareExpiryDays} days`}</p>

          <div class="modal-actions">
            <button class="btn btn-secondary btn-sm" onclick={() => shareUrl = null}>Back</button>
            <button class="btn btn-primary btn-sm" onclick={() => showShareModal = false}>Done</button>
          </div>
        </div>
      {/if}
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

  .share-modal {
    max-width: 450px;
  }

  .share-config,
  .share-result {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .form-group > label,
  .form-group > .form-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .form-group input[type="text"] {
    padding: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-bg);
    color: var(--color-text);
    font-size: 0.85rem;
  }

  .form-group select {
    padding: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-bg);
    color: var(--color-text);
    font-size: 0.85rem;
    cursor: pointer;
  }

  .field-hint {
    font-size: 0.7rem;
    color: var(--color-text-muted);
    margin: 0;
  }

  .permission-toggles {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem;
    background: var(--color-bg);
    border-radius: var(--radius);
    border: 1px solid var(--color-border);
  }

  .permission-toggle {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    cursor: pointer;
  }

  .permission-toggle input[type="checkbox"] {
    margin-top: 0.125rem;
    accent-color: var(--color-primary);
  }

  .permission-toggle input[type="checkbox"]:disabled {
    opacity: 0.5;
  }

  .toggle-label {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .toggle-name {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--color-text);
  }

  .toggle-desc {
    font-size: 0.7rem;
    color: var(--color-text-muted);
  }

  .permission-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    font-size: 0.7rem;
    font-weight: 500;
    border-radius: var(--radius);
    background: var(--color-primary);
    color: white;
  }

  .badge-warn {
    background: var(--color-warning, #f59e0b);
  }

  .display-name-note {
    font-size: 0.8rem;
    color: var(--color-text-muted);
    margin: 0;
  }

  .display-name-note strong {
    color: var(--color-text);
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

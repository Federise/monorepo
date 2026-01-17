<script lang="ts">
  import type { ChannelEvent } from '@federise/sdk';
  import { getColorForName, getMessageDisplay, filterDisplayMessages } from '../../lib/chat-utils';

  interface Props {
    messages: ChannelEvent[];
    isLoading?: boolean;
    emptyMessage?: string;
    /** Can delete any message */
    canDeleteAny?: boolean;
    /** Can delete own messages only */
    canDeleteOwn?: boolean;
    /** Current user's author ID (for delete:own permission check) */
    currentAuthorId?: string;
    /** Callback when delete is requested */
    onDelete?: (message: ChannelEvent) => void;
  }

  let {
    messages,
    isLoading = false,
    emptyMessage = 'No messages yet.',
    canDeleteAny = false,
    canDeleteOwn = false,
    currentAuthorId = '',
    onDelete,
  }: Props = $props();

  const displayMessages = $derived(filterDisplayMessages(messages));

  function canDeleteMessage(message: ChannelEvent): boolean {
    if (message.deleted) return false; // Already deleted
    if (canDeleteAny) return true;
    if (canDeleteOwn && currentAuthorId && message.authorId === currentAuthorId) return true;
    return false;
  }

  function handleDelete(message: ChannelEvent) {
    if (onDelete && canDeleteMessage(message)) {
      onDelete(message);
    }
  }
</script>

<div class="messages">
  {#if isLoading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading messages...</p>
    </div>
  {:else if displayMessages.length === 0}
    <div class="empty-state">
      <p>{emptyMessage}</p>
    </div>
  {:else}
    {#each displayMessages as message}
      {@const display = getMessageDisplay(message)}
      {@const canDelete = canDeleteMessage(message)}
      <div class="message" class:deleted={message.deleted}>
        <span class="author" style="color: {getColorForName(display.author)}">{display.author}</span>
        <span class="content">
          {#if message.deleted}
            <em class="deleted-text">Message deleted</em>
          {:else}
            {display.text}
          {/if}
        </span>
        <span class="time">{new Date(message.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
        {#if canDelete && onDelete}
          <button class="delete-btn" onclick={() => handleDelete(message)} title="Delete message">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </button>
        {/if}
      </div>
    {/each}
  {/if}
</div>

<style>
  .messages {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-height: 0;
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

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .message {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.85rem;
    border-radius: var(--radius);
    position: relative;
  }

  .message:hover {
    background: var(--color-bg);
  }

  .message.deleted {
    opacity: 0.6;
  }

  .author {
    font-weight: 600;
    font-size: 0.8rem;
    flex-shrink: 0;
  }

  .content {
    flex: 1;
    word-break: break-word;
  }

  .deleted-text {
    color: var(--color-text-muted);
    font-style: italic;
  }

  .time {
    font-size: 0.7rem;
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  .delete-btn {
    opacity: 0;
    padding: 0.125rem;
    background: transparent;
    border: none;
    color: var(--color-text-muted);
    border-radius: var(--radius);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 0.15s;
    flex-shrink: 0;
  }

  .message:hover .delete-btn {
    opacity: 1;
  }

  .delete-btn:hover {
    color: var(--color-error, #ef4444);
    background: var(--color-surface-hover);
  }
</style>

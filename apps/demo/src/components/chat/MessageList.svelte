<script lang="ts">
  import type { LogEvent } from '@federise/sdk';
  import { getColorForName, getMessageDisplay, filterDisplayMessages } from '../../lib/chat-utils';

  interface Props {
    messages: LogEvent[];
    isLoading?: boolean;
    emptyMessage?: string;
  }

  let { messages, isLoading = false, emptyMessage = 'No messages yet.' }: Props = $props();

  const displayMessages = $derived(filterDisplayMessages(messages));
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
      <div class="message">
        <span class="author" style="color: {getColorForName(display.author)}">{display.author}</span>
        <span class="content">{display.text}</span>
        <span class="time">{new Date(message.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
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
  }

  .message:hover {
    background: var(--color-bg);
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

  .time {
    font-size: 0.7rem;
    color: var(--color-text-muted);
    flex-shrink: 0;
  }
</style>

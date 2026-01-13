<script lang="ts">
  interface Props {
    value: string;
    placeholder?: string;
    disabled?: boolean;
    isSending?: boolean;
    onSend: () => void;
  }

  let { value = $bindable(), placeholder = 'Type a message...', disabled = false, isSending = false, onSend }: Props = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }
</script>

<div class="message-input">
  <input
    type="text"
    {placeholder}
    bind:value
    onkeydown={handleKeydown}
    disabled={disabled || isSending}
  />
  <button class="btn btn-primary btn-sm" onclick={onSend} disabled={isSending || !value.trim()}>
    {isSending ? '...' : 'Send'}
  </button>
</div>

<style>
  .message-input {
    display: flex;
    gap: 0.5rem;
    padding: 0.5rem;
    border-top: 1px solid var(--color-border);
    flex-shrink: 0;
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
</style>

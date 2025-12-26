<script lang="ts">
  import { onMount } from 'svelte';

  let statusMessage = $state('');

  onMount(() => {
    // Listen for toast events
    const handleToast = (event: CustomEvent<string>) => {
      statusMessage = event.detail;
      setTimeout(() => (statusMessage = ''), 3000);
    };

    window.addEventListener('show-toast', handleToast as EventListener);
    return () => window.removeEventListener('show-toast', handleToast as EventListener);
  });

  // Export function to show toast
  export function showToast(message: string) {
    const event = new CustomEvent('show-toast', { detail: message });
    window.dispatchEvent(event);
  }
</script>

{#if statusMessage}
  <div class="toast">{statusMessage}</div>
{/if}

<style>
  .toast {
    position: fixed;
    top: var(--space-xl);
    right: var(--space-xl);
    padding: var(--space-md) var(--space-xl);
    background: var(--color-primary);
    color: var(--color-white);
    border-radius: var(--radius-md);
    font-size: var(--font-size-md);
    z-index: 1000;
    animation: slideIn var(--transition-base) ease;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>

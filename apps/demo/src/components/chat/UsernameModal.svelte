<script lang="ts">
  interface Props {
    show: boolean;
    username: string;
    onSave: () => void;
    onCancel: () => void;
  }

  let { show = $bindable(), username = $bindable(), onSave, onCancel }: Props = $props();

  function handleSave() {
    onSave();
    show = false;
  }

  function handleCancel() {
    onCancel();
    show = false;
  }
</script>

{#if show}
  <div class="modal-overlay" role="presentation">
    <div class="modal" role="dialog" aria-modal="true" tabindex="-1">
      <h3>Set Username</h3>
      <p>Choose a display name for your messages:</p>
      <input
        type="text"
        placeholder="Enter username"
        bind:value={username}
        onkeydown={(e) => e.key === 'Enter' && handleSave()}
        class="username-input"
      />
      <div class="modal-actions">
        <button class="btn btn-secondary btn-sm" onclick={handleCancel}>Cancel</button>
        <button class="btn btn-primary btn-sm" onclick={handleSave}>Save</button>
      </div>
    </div>
  </div>
{/if}

<style>
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
    max-width: 350px;
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

  .btn-sm {
    padding: 0.375rem 0.625rem;
    font-size: 0.8rem;
  }
</style>

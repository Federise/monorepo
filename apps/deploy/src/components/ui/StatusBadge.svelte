<script lang="ts">
  type Status = 'pending' | 'running' | 'success' | 'error' | 'warning';

  interface Props {
    status: Status;
    label?: string;
  }

  let { status, label }: Props = $props();

  const statusLabels: Record<Status, string> = {
    pending: 'Pending',
    running: 'Running',
    success: 'Success',
    error: 'Error',
    warning: 'Warning'
  };
</script>

<span class="status-badge" class:pending={status === 'pending'} class:running={status === 'running'} class:success={status === 'success'} class:error={status === 'error'} class:warning={status === 'warning'}>
  {#if status === 'running'}
    <span class="spinner"></span>
  {/if}
  {label ?? statusLabels[status]}
</span>

<style>
  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: var(--font-size-xs);
    padding: 4px 10px;
    border-radius: var(--radius-full);
    font-weight: 500;
  }

  .pending {
    background: var(--surface-2);
    color: var(--color-text-muted);
  }

  .running {
    background: var(--color-primary-light);
    color: var(--color-primary);
  }

  .success {
    background: var(--color-success-bg);
    color: var(--color-success);
  }

  .error {
    background: var(--color-error-bg);
    color: var(--color-error);
  }

  .warning {
    background: var(--color-warning-bg);
    color: var(--color-warning);
  }

  .spinner {
    width: 10px;
    height: 10px;
    border: 2px solid transparent;
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>

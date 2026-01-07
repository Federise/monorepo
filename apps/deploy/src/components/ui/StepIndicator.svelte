<script lang="ts">
  import type { DeploymentStep } from '../../lib/types.js';

  interface Step {
    id: DeploymentStep;
    label: string;
    icon: string;
  }

  const steps: Step[] = [
    { id: 'auth', label: 'Authenticate', icon: '1' },
    { id: 'config', label: 'Configure', icon: '2' },
    { id: 'deploy', label: 'Deploy', icon: '3' },
    { id: 'success', label: 'Complete', icon: '✓' }
  ];

  interface Props {
    currentStep: DeploymentStep;
  }

  let { currentStep }: Props = $props();

  function getStepStatus(stepId: DeploymentStep): 'completed' | 'current' | 'upcoming' {
    const stepOrder: DeploymentStep[] = ['auth', 'config', 'deploy', 'success'];
    const currentIndex = stepOrder.indexOf(currentStep);
    const stepIndex = stepOrder.indexOf(stepId);

    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'current';
    return 'upcoming';
  }
</script>

<div class="step-indicator">
  {#each steps as step, i}
    {@const status = getStepStatus(step.id)}
    <div class="step" class:completed={status === 'completed'} class:current={status === 'current'}>
      <div class="step-circle">
        {#if status === 'completed'}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="check-icon">
            <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
          </svg>
        {:else}
          <span class="step-number">{step.icon}</span>
        {/if}
      </div>
      <span class="step-label">{step.label}</span>
    </div>
    {#if i < steps.length - 1}
      <div class="step-line" class:completed={status === 'completed'}></div>
    {/if}
  {/each}
</div>

<style>
  .step-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xs);
    margin-bottom: var(--space-2xl);
  }

  .step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-sm);
  }

  .step-circle {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-2);
    border: 2px solid var(--border-muted);
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
    font-weight: 500;
    transition: all var(--transition-base);
  }

  .step.current .step-circle {
    background: var(--color-primary-light);
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .step.completed .step-circle {
    background: var(--color-success);
    border-color: var(--color-success);
    color: var(--color-bg);
  }

  .check-icon {
    width: 16px;
    height: 16px;
  }

  .step-number {
    font-family: 'JetBrains Mono', monospace;
  }

  .step-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .step.current .step-label {
    color: var(--color-white);
  }

  .step.completed .step-label {
    color: var(--color-success);
  }

  .step-line {
    width: 60px;
    height: 2px;
    background: var(--border-muted);
    margin-bottom: 24px;
    transition: background var(--transition-base);
  }

  .step-line.completed {
    background: var(--color-success);
  }

  @media (max-width: 640px) {
    .step-label {
      display: none;
    }

    .step-line {
      width: 30px;
      margin-bottom: 0;
    }
  }
</style>

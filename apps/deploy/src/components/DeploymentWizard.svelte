<script lang="ts">
  import { deploymentStore } from '../lib/stores/deployment.svelte.js';
  import StepIndicator from './ui/StepIndicator.svelte';
  import Terminal from './terminal/Terminal.svelte';
  import AuthStep from './steps/AuthStep.svelte';
  import ConfigStep from './steps/ConfigStep.svelte';
  import DeployStep from './steps/DeployStep.svelte';
  import SuccessStep from './steps/SuccessStep.svelte';
</script>

<div class="deployment-wizard">
  <StepIndicator currentStep={deploymentStore.step} />

  <div class="wizard-content">
    <div class="step-panel">
      {#if deploymentStore.step === 'auth'}
        <AuthStep />
      {:else if deploymentStore.step === 'config'}
        <ConfigStep />
      {:else if deploymentStore.step === 'deploy'}
        <DeployStep />
      {:else if deploymentStore.step === 'success'}
        <SuccessStep />
      {/if}
    </div>

    <div class="terminal-panel">
      <Terminal />
    </div>
  </div>

  {#if deploymentStore.state.error}
    <div class="global-error">
      <div class="error-content">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="error-icon">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
        </svg>
        <span>{deploymentStore.state.error}</span>
        <button class="dismiss-btn" onclick={() => deploymentStore.clearError()} aria-label="Dismiss error">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .deployment-wizard {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .wizard-content {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-xl);
    align-items: start;
    overflow: hidden;
  }

  .step-panel {
    min-height: 400px;
    min-width: 0;
    overflow: hidden;
  }

  .terminal-panel {
    position: sticky;
    top: var(--space-2xl);
    min-width: 0;
    overflow: hidden;
  }

  .global-error {
    position: fixed;
    bottom: var(--space-xl);
    left: 50%;
    transform: translateX(-50%);
    z-index: 100;
  }

  .error-content {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    background: var(--color-error-bg);
    border: 1px solid var(--color-error);
    border-radius: var(--radius-lg);
    padding: var(--space-md) var(--space-lg);
    color: var(--color-error);
    font-size: var(--font-size-sm);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  }

  .error-icon {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .dismiss-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-error);
    cursor: pointer;
    opacity: 0.7;
    transition: opacity var(--transition-fast);
  }

  .dismiss-btn:hover {
    opacity: 1;
  }

  .dismiss-btn svg {
    width: 16px;
    height: 16px;
  }

  @media (max-width: 900px) {
    .wizard-content {
      grid-template-columns: 1fr;
    }

    .terminal-panel {
      position: static;
      order: -1;
    }
  }
</style>

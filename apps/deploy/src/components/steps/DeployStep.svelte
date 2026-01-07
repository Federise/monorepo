<script lang="ts">
  import { onMount } from 'svelte';
  import { deploymentStore } from '../../lib/stores/deployment.svelte.js';
  import { webcontainerStore } from '../../lib/stores/webcontainer.svelte.js';
  import { terminalStore } from '../terminal/TerminalStore.svelte.js';
  import {
    runWranglerKvCreate,
    runWranglerR2Create,
    runWranglerSecretPut,
    runWranglerDeploy
  } from '../../lib/webcontainer/commands.js';
  import { updateWranglerConfig } from '../../lib/webcontainer/filesystem.js';
  import {
    parseKvNamespaceId,
    parseWorkerUrl,
    bucketAlreadyExists,
    kvNamespaceAlreadyExists
  } from '../../lib/webcontainer/output-parser.js';
  import StatusBadge from '../ui/StatusBadge.svelte';

  type TaskStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped';

  interface DeployTask {
    id: string;
    label: string;
    status: TaskStatus;
    error?: string;
  }

  let tasks = $state<DeployTask[]>([
    { id: 'kv', label: 'Create KV namespace', status: 'pending' },
    { id: 'r2-private', label: 'Create private R2 bucket', status: 'pending' },
    { id: 'r2-public', label: 'Create public R2 bucket', status: 'pending' },
    { id: 'secrets', label: 'Configure secrets', status: 'pending' },
    { id: 'deploy', label: 'Deploy worker', status: 'pending' }
  ]);

  let isDeploying = $state(false);
  let deployError = $state<string | null>(null);
  let hasStarted = $state(false);

  function updateTask(id: string, updates: Partial<DeployTask>) {
    tasks = tasks.map((t) => (t.id === id ? { ...t, ...updates } : t));
  }

  async function runDeployment() {
    if (!webcontainerStore.instance) {
      deployError = 'WebContainer not initialized';
      return;
    }

    isDeploying = true;
    hasStarted = true;
    deployError = null;

    const container = webcontainerStore.instance;
    const terminal = terminalStore.terminal ?? undefined;
    const state = deploymentStore.state;

    try {
      // Step 1: Create KV namespace (skip if already created)
      if (!state.kvNamespaceId) {
        updateTask('kv', { status: 'running' });
        terminal?.writeln('\n\x1b[90m━━━ Creating KV namespace ━━━\x1b[0m\n');

        const kvResult = await runWranglerKvCreate(container, 'KV', terminal);

        if (kvResult.exitCode === 0 || kvNamespaceAlreadyExists(kvResult.stdout)) {
          const namespaceId = parseKvNamespaceId(kvResult.stdout);
          if (namespaceId) {
            deploymentStore.setKvNamespaceId(namespaceId);
            await updateWranglerConfig(container, namespaceId);
            updateTask('kv', { status: 'success' });
            terminal?.writeln(`\n\x1b[32m✓ KV namespace created: ${namespaceId}\x1b[0m\n`);
          } else if (kvNamespaceAlreadyExists(kvResult.stdout)) {
            updateTask('kv', { status: 'skipped', error: 'Already exists' });
            terminal?.writeln('\n\x1b[33m⚠ KV namespace already exists\x1b[0m\n');
          } else {
            throw new Error('Could not parse KV namespace ID');
          }
        } else {
          throw new Error('Failed to create KV namespace');
        }
      } else {
        updateTask('kv', { status: 'skipped', error: 'Already created' });
      }

      // Step 2: Create private R2 bucket
      if (!state.privateBucketCreated) {
        updateTask('r2-private', { status: 'running' });
        terminal?.writeln('\n\x1b[90m━━━ Creating private R2 bucket ━━━\x1b[0m\n');

        const r2Result = await runWranglerR2Create(container, 'federise-objects', terminal);

        if (r2Result.exitCode === 0 || bucketAlreadyExists(r2Result.stdout + r2Result.stderr)) {
          deploymentStore.setPrivateBucketCreated();
          updateTask('r2-private', { status: 'success' });
          terminal?.writeln('\n\x1b[32m✓ Private bucket ready\x1b[0m\n');
        } else {
          throw new Error('Failed to create private R2 bucket');
        }
      } else {
        updateTask('r2-private', { status: 'skipped', error: 'Already created' });
      }

      // Step 3: Create public R2 bucket
      if (!state.publicBucketCreated) {
        updateTask('r2-public', { status: 'running' });
        terminal?.writeln('\n\x1b[90m━━━ Creating public R2 bucket ━━━\x1b[0m\n');

        const r2PublicResult = await runWranglerR2Create(
          container,
          'federise-objects-public',
          terminal
        );

        if (
          r2PublicResult.exitCode === 0 ||
          bucketAlreadyExists(r2PublicResult.stdout + r2PublicResult.stderr)
        ) {
          deploymentStore.setPublicBucketCreated();
          updateTask('r2-public', { status: 'success' });
          terminal?.writeln('\n\x1b[32m✓ Public bucket ready\x1b[0m\n');
        } else {
          throw new Error('Failed to create public R2 bucket');
        }
      } else {
        updateTask('r2-public', { status: 'skipped', error: 'Already created' });
      }

      // Step 4: Set secrets
      if (!state.secretsSet) {
        updateTask('secrets', { status: 'running' });
        terminal?.writeln('\n\x1b[90m━━━ Configuring secrets ━━━\x1b[0m\n');

        // Set BOOTSTRAP_API_KEY
        await runWranglerSecretPut(
          container,
          'BOOTSTRAP_API_KEY',
          state.bootstrapApiKey!,
          terminal
        );

        // Set R2 credentials if provided
        if (state.r2AccountId && state.r2AccessKeyId && state.r2SecretAccessKey) {
          await runWranglerSecretPut(container, 'R2_ACCOUNT_ID', state.r2AccountId, terminal);
          await runWranglerSecretPut(container, 'R2_ACCESS_KEY_ID', state.r2AccessKeyId, terminal);
          await runWranglerSecretPut(
            container,
            'R2_SECRET_ACCESS_KEY',
            state.r2SecretAccessKey,
            terminal
          );
        }

        deploymentStore.setSecretsSet();
        updateTask('secrets', { status: 'success' });
        terminal?.writeln('\n\x1b[32m✓ Secrets configured\x1b[0m\n');
      } else {
        updateTask('secrets', { status: 'skipped', error: 'Already set' });
      }

      // Step 5: Deploy worker
      updateTask('deploy', { status: 'running' });
      terminal?.writeln('\n\x1b[90m━━━ Deploying worker ━━━\x1b[0m\n');

      const deployResult = await runWranglerDeploy(container, terminal);

      if (deployResult.exitCode === 0) {
        const workerUrl = parseWorkerUrl(deployResult.stdout);
        if (workerUrl) {
          deploymentStore.setDeployed(workerUrl);
          updateTask('deploy', { status: 'success' });
          terminal?.writeln(`\n\x1b[32m✓ Deployed to ${workerUrl}\x1b[0m\n`);
          deploymentStore.setStep('success');
        } else {
          // Fallback: still successful but couldn't parse URL
          deploymentStore.setDeployed('https://federise-gateway.workers.dev');
          updateTask('deploy', { status: 'success' });
          deploymentStore.setStep('success');
        }
      } else {
        throw new Error('Deployment failed');
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Deployment failed';
      deployError = error;

      // Mark current running task as error
      tasks = tasks.map((t) => (t.status === 'running' ? { ...t, status: 'error', error } : t));

      terminal?.writeln(`\n\x1b[31m✗ Error: ${error}\x1b[0m\n`);
    } finally {
      isDeploying = false;
    }
  }

  function handleBack() {
    deploymentStore.setStep('config');
  }

  function handleRetry() {
    // Reset failed tasks to pending
    tasks = tasks.map((t) => (t.status === 'error' ? { ...t, status: 'pending', error: undefined } : t));
    deployError = null;
    runDeployment();
  }

  onMount(() => {
    // Auto-start deployment
    runDeployment();
  });
</script>

<div class="deploy-step">
  <h2>Deploying Your Gateway</h2>
  <p class="description">
    Creating resources and deploying to Cloudflare Workers...
  </p>

  <div class="task-list">
    {#each tasks as task}
      <div class="task" class:running={task.status === 'running'} class:success={task.status === 'success'} class:error={task.status === 'error'} class:skipped={task.status === 'skipped'}>
        <div class="task-icon">
          {#if task.status === 'pending'}
            <span class="icon pending">○</span>
          {:else if task.status === 'running'}
            <span class="spinner"></span>
          {:else if task.status === 'success'}
            <span class="icon success">✓</span>
          {:else if task.status === 'error'}
            <span class="icon error">✗</span>
          {:else if task.status === 'skipped'}
            <span class="icon skipped">–</span>
          {/if}
        </div>
        <div class="task-content">
          <span class="task-label">{task.label}</span>
          {#if task.error}
            <span class="task-error">{task.error}</span>
          {/if}
        </div>
        <div class="task-status">
          <StatusBadge status={task.status === 'skipped' ? 'warning' : task.status === 'pending' ? 'pending' : task.status === 'running' ? 'running' : task.status === 'success' ? 'success' : 'error'} label={task.status === 'skipped' ? 'Skipped' : undefined} />
        </div>
      </div>
    {/each}
  </div>

  {#if deployError}
    <div class="error-section">
      <p class="error-message">{deployError}</p>
      <div class="error-actions">
        <button class="secondary-btn" onclick={handleBack}>
          Back to Config
        </button>
        <button class="primary-btn" onclick={handleRetry}>
          Retry
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .deploy-step {
    background: var(--surface-1);
    border: 1px solid var(--border-muted);
    border-radius: var(--radius-lg);
    padding: var(--space-2xl);
  }

  h2 {
    font-size: var(--font-size-xl);
    margin-bottom: var(--space-sm);
  }

  .description {
    color: var(--color-text-muted);
    margin-bottom: var(--space-2xl);
  }

  .task-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .task {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    padding: var(--space-md) var(--space-lg);
    background: var(--surface-2);
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
  }

  .task.running {
    background: var(--color-primary-light);
    border: 1px solid var(--border-primary);
  }

  .task.success {
    opacity: 0.8;
  }

  .task.error {
    background: var(--color-error-bg);
  }

  .task.skipped {
    opacity: 0.6;
  }

  .task-icon {
    width: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .icon {
    font-size: 16px;
  }

  .icon.pending {
    color: var(--color-text-subtle);
  }

  .icon.success {
    color: var(--color-success);
  }

  .icon.error {
    color: var(--color-error);
  }

  .icon.skipped {
    color: var(--color-text-muted);
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid transparent;
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .task-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .task-label {
    font-size: var(--font-size-base);
    color: var(--color-text);
  }

  .task-error {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .error-section {
    margin-top: var(--space-xl);
    padding-top: var(--space-xl);
    border-top: 1px solid var(--border-muted);
  }

  .error-message {
    color: var(--color-error);
    margin-bottom: var(--space-lg);
  }

  .error-actions {
    display: flex;
    gap: var(--space-md);
    justify-content: flex-end;
  }

  .primary-btn, .secondary-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-xl);
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .primary-btn {
    background: var(--color-primary);
    color: white;
    border: none;
  }

  .primary-btn:hover {
    background: var(--color-primary-hover);
  }

  .secondary-btn {
    background: transparent;
    color: var(--color-text-muted);
    border: 1px solid var(--border-muted);
  }

  .secondary-btn:hover {
    background: var(--surface-2);
    color: var(--color-text);
  }
</style>

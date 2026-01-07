export type DeploymentStep = 'auth' | 'config' | 'deploy' | 'success';

export interface DeploymentState {
  step: DeploymentStep;
  isAuthenticated: boolean;
  accountId: string | null;
  email: string | null;

  // Configuration
  bootstrapApiKey: string | null;
  r2AccountId: string | null;
  r2AccessKeyId: string | null;
  r2SecretAccessKey: string | null;

  // Created resources
  kvNamespaceId: string | null;
  privateBucketCreated: boolean;
  publicBucketCreated: boolean;
  secretsSet: boolean;

  // Deployment result
  workerUrl: string | null;
  deployedAt: string | null;

  // Errors
  error: string | null;
}

export type TerminalMode = 'readonly' | 'limited' | 'full';

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export const STORAGE_KEY = 'federise-deploy-state';

export function createInitialState(): DeploymentState {
  return {
    step: 'auth',
    isAuthenticated: false,
    accountId: null,
    email: null,
    bootstrapApiKey: null,
    r2AccountId: null,
    r2AccessKeyId: null,
    r2SecretAccessKey: null,
    kvNamespaceId: null,
    privateBucketCreated: false,
    publicBucketCreated: false,
    secretsSet: false,
    workerUrl: null,
    deployedAt: null,
    error: null
  };
}

export function loadState(): DeploymentState {
  if (typeof localStorage === 'undefined') {
    return createInitialState();
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...createInitialState(), ...JSON.parse(stored) };
    }
  } catch {
    // Ignore parsing errors
  }
  return createInitialState();
}

export function saveState(state: DeploymentState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

export function clearState(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

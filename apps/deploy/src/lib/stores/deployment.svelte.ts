import {
  type DeploymentState,
  type DeploymentStep,
  loadState,
  saveState,
  clearState,
  createInitialState
} from '../types.js';

class DeploymentStore {
  private _state = $state<DeploymentState>(createInitialState());

  constructor() {
    // Load persisted state on init (browser only)
    if (typeof window !== 'undefined') {
      this._state = loadState();
    }
  }

  get state(): DeploymentState {
    return this._state;
  }

  get step(): DeploymentStep {
    return this._state.step;
  }

  setStep(step: DeploymentStep) {
    this._state.step = step;
    this.persist();
  }

  setAuthenticated(accountId: string, email: string) {
    this._state.isAuthenticated = true;
    this._state.accountId = accountId;
    this._state.email = email;
    this._state.error = null;
    this.persist();
  }

  setConfig(config: {
    bootstrapApiKey: string;
    r2AccountId?: string;
    r2AccessKeyId?: string;
    r2SecretAccessKey?: string;
  }) {
    this._state.bootstrapApiKey = config.bootstrapApiKey;
    this._state.r2AccountId = config.r2AccountId ?? null;
    this._state.r2AccessKeyId = config.r2AccessKeyId ?? null;
    this._state.r2SecretAccessKey = config.r2SecretAccessKey ?? null;
    this.persist();
  }

  setKvNamespaceId(id: string) {
    this._state.kvNamespaceId = id;
    this.persist();
  }

  setPrivateBucketCreated() {
    this._state.privateBucketCreated = true;
    this.persist();
  }

  setPublicBucketCreated() {
    this._state.publicBucketCreated = true;
    this.persist();
  }

  setSecretsSet() {
    this._state.secretsSet = true;
    this.persist();
  }

  setDeployed(workerUrl: string) {
    this._state.workerUrl = workerUrl;
    this._state.deployedAt = new Date().toISOString();
    this.persist();
  }

  setError(error: string) {
    this._state.error = error;
    this.persist();
  }

  clearError() {
    this._state.error = null;
    this.persist();
  }

  reset() {
    this._state = createInitialState();
    clearState();
  }

  private persist() {
    saveState(this._state);
  }
}

export const deploymentStore = new DeploymentStore();

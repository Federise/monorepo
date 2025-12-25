<script lang="ts">
  import { onMount } from 'svelte';
  import { createGatewayClient, withAuth } from '../api/client';

  const STORAGE_KEY_API = 'federise:gateway:apiKey';
  const STORAGE_KEY_URL = 'federise:gateway:url';

  let gatewayUrl = $state('');
  let apiKey = $state('');
  let isConnected = $state(false);
  let showApiKey = $state(false);
  let activeTab = $state<'overview' | 'permissions' | 'settings'>('overview');
  let statusMessage = $state('');

  // Mock data for permissions
  const permissions = [
    { id: '1', app: 'Notes App', capabilities: ['kv:read', 'kv:write'], granted: '2 days ago' },
    { id: '2', app: 'Photo Backup', capabilities: ['blob:read', 'blob:write'], granted: '1 week ago' },
    { id: '3', app: 'Task Manager', capabilities: ['kv:read', 'kv:write', 'notifications'], granted: '3 weeks ago' },
  ];

  // Mock data for settings
  const settings = {
    autoSync: true,
    notifications: true,
    debugMode: false,
  };

  onMount(async () => {
    const savedKey = localStorage.getItem(STORAGE_KEY_API);
    const savedUrl = localStorage.getItem(STORAGE_KEY_URL);

    if (savedKey && savedUrl) {
      apiKey = savedKey;
      gatewayUrl = savedUrl;
      await checkConnection();
    }
  });

  async function checkConnection() {
    if (!gatewayUrl || !apiKey) {
      isConnected = false;
      return;
    }

    try {
      const client = createGatewayClient(gatewayUrl);
      const { data } = await client.GET('/ping', withAuth(apiKey));
      isConnected = data?.message === 'pong';
    } catch {
      isConnected = false;
    }
  }

  function copyApiKey() {
    navigator.clipboard.writeText(apiKey);
    statusMessage = 'API key copied!';
    setTimeout(() => (statusMessage = ''), 2000);
  }

  function disconnect() {
    localStorage.removeItem(STORAGE_KEY_API);
    localStorage.removeItem(STORAGE_KEY_URL);
    apiKey = '';
    gatewayUrl = '';
    isConnected = false;
  }

  function revokePermission(id: string) {
    statusMessage = 'Permission revoked (mock)';
    setTimeout(() => (statusMessage = ''), 2000);
  }
</script>

{#if !apiKey}
  <div class="not-connected">
    <div class="empty-state">
      <h2>No Gateway Connected</h2>
      <p>You haven't connected a gateway yet. Set one up to get started.</p>
      <a href="/start" class="btn btn-primary">Connect Gateway</a>
    </div>
  </div>
{:else}
  <div class="manager">
    <!-- Status Bar -->
    <div class="status-bar">
      <div class="status-indicator {isConnected ? 'connected' : 'disconnected'}">
        <span class="dot"></span>
        {isConnected ? 'Connected' : 'Disconnected'}
      </div>
      {#if statusMessage}
        <div class="status-message">{statusMessage}</div>
      {/if}
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button
        class="tab {activeTab === 'overview' ? 'active' : ''}"
        onclick={() => (activeTab = 'overview')}
      >
        Overview
      </button>
      <button
        class="tab {activeTab === 'permissions' ? 'active' : ''}"
        onclick={() => (activeTab = 'permissions')}
      >
        Permissions
      </button>
      <button
        class="tab {activeTab === 'settings' ? 'active' : ''}"
        onclick={() => (activeTab = 'settings')}
      >
        Settings
      </button>
    </div>

    <!-- Tab Content -->
    <div class="tab-content">
      {#if activeTab === 'overview'}
        <div class="section">
          <h3>Gateway URL</h3>
          <div class="info-row">
            <code class="info-value">{gatewayUrl}</code>
            <button class="btn-icon" onclick={() => navigator.clipboard.writeText(gatewayUrl)}>
              Copy
            </button>
          </div>
        </div>

        <div class="section">
          <h3>API Key</h3>
          <div class="info-row">
            <code class="info-value">
              {showApiKey ? apiKey : '•'.repeat(32)}
            </code>
            <button class="btn-icon" onclick={() => (showApiKey = !showApiKey)}>
              {showApiKey ? 'Hide' : 'Show'}
            </button>
            <button class="btn-icon" onclick={copyApiKey}>Copy</button>
          </div>
        </div>

        <div class="section">
          <h3>Quick Stats</h3>
          <div class="stats-grid">
            <div class="stat-card">
              <span class="stat-value">3</span>
              <span class="stat-label">Apps Connected</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">12</span>
              <span class="stat-label">KV Namespaces</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">847</span>
              <span class="stat-label">Total Keys</span>
            </div>
          </div>
        </div>

        <div class="section danger-zone">
          <h3>Danger Zone</h3>
          <p>Disconnect this gateway from your browser. You'll need to re-activate to use it again.</p>
          <button class="btn btn-danger" onclick={disconnect}>Disconnect Gateway</button>
        </div>
      {/if}

      {#if activeTab === 'permissions'}
        <div class="section">
          <h3>App Permissions</h3>
          <p>Manage which apps have access to your gateway capabilities.</p>

          <div class="permissions-list">
            {#each permissions as perm}
              <div class="permission-card">
                <div class="permission-info">
                  <span class="app-name">{perm.app}</span>
                  <span class="granted-date">Granted {perm.granted}</span>
                  <div class="capabilities">
                    {#each perm.capabilities as cap}
                      <span class="capability-tag">{cap}</span>
                    {/each}
                  </div>
                </div>
                <button class="btn btn-small btn-danger" onclick={() => revokePermission(perm.id)}>
                  Revoke
                </button>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if activeTab === 'settings'}
        <div class="section">
          <h3>Gateway Settings</h3>

          <div class="settings-list">
            <label class="setting-row">
              <div class="setting-info">
                <span class="setting-name">Auto-sync</span>
                <span class="setting-desc">Automatically sync data in the background</span>
              </div>
              <input type="checkbox" checked={settings.autoSync} class="toggle" />
            </label>

            <label class="setting-row">
              <div class="setting-info">
                <span class="setting-name">Notifications</span>
                <span class="setting-desc">Receive notifications from connected apps</span>
              </div>
              <input type="checkbox" checked={settings.notifications} class="toggle" />
            </label>

            <label class="setting-row">
              <div class="setting-info">
                <span class="setting-name">Debug Mode</span>
                <span class="setting-desc">Show detailed logs in the console</span>
              </div>
              <input type="checkbox" checked={settings.debugMode} class="toggle" />
            </label>
          </div>
        </div>

        <div class="section">
          <h3>Data Management</h3>
          <div class="button-group">
            <button class="btn btn-secondary">Export All Data</button>
            <button class="btn btn-secondary">Clear Cache</button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .not-connected {
    display: flex;
    justify-content: center;
    padding: 4rem 0;
  }

  .empty-state {
    text-align: center;
    padding: 3rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 16px;
    max-width: 400px;
  }

  .empty-state h2 {
    margin-bottom: 0.5rem;
  }

  .empty-state p {
    margin-bottom: 1.5rem;
  }

  .manager {
    max-width: 800px;
    margin: 0 auto;
  }

  .status-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    font-weight: 500;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .connected .dot {
    background: #4ade80;
    box-shadow: 0 0 8px #4ade80;
  }

  .disconnected .dot {
    background: #f87171;
  }

  .status-message {
    color: #4ade80;
    font-size: 0.85rem;
  }

  .tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding-bottom: 0.5rem;
  }

  .tab {
    padding: 0.75rem 1.5rem;
    background: none;
    border: none;
    color: #a0a0a0;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
    border-radius: 8px;
    transition: all 0.2s;
  }

  .tab:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.05);
  }

  .tab.active {
    color: #fff;
    background: rgba(139, 92, 246, 0.2);
  }

  .section {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    padding: 1.5rem;
    margin-bottom: 1rem;
  }

  .section h3 {
    font-size: 1rem;
    margin-bottom: 0.75rem;
    color: #fff;
  }

  .section p {
    font-size: 0.85rem;
    margin-bottom: 1rem;
  }

  .info-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .info-value {
    flex: 1;
    padding: 0.75rem 1rem;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 8px;
    font-size: 0.85rem;
    color: #a0a0a0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .btn-icon {
    padding: 0.5rem 1rem;
    background: rgba(139, 92, 246, 0.2);
    border: 1px solid rgba(139, 92, 246, 0.3);
    border-radius: 6px;
    color: #fff;
    cursor: pointer;
    font-size: 0.8rem;
    transition: all 0.2s;
  }

  .btn-icon:hover {
    background: rgba(139, 92, 246, 0.3);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
  }

  .stat-card {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
    padding: 1rem;
    text-align: center;
  }

  .stat-value {
    display: block;
    font-size: 1.5rem;
    font-weight: 600;
    color: #fff;
  }

  .stat-label {
    font-size: 0.75rem;
    color: #a0a0a0;
  }

  .danger-zone {
    border-color: rgba(239, 68, 68, 0.2);
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
    font-size: 0.9rem;
  }

  .btn-primary {
    background: rgba(139, 92, 246, 0.8);
    color: #fff;
  }

  .btn-primary:hover {
    background: rgba(139, 92, 246, 1);
  }

  .btn-secondary {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  .btn-danger {
    background: rgba(239, 68, 68, 0.2);
    color: #f87171;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  .btn-danger:hover {
    background: rgba(239, 68, 68, 0.3);
  }

  .btn-small {
    padding: 0.5rem 1rem;
    font-size: 0.8rem;
  }

  .button-group {
    display: flex;
    gap: 0.75rem;
  }

  /* Permissions */
  .permissions-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .permission-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
  }

  .permission-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .app-name {
    font-weight: 500;
    color: #fff;
  }

  .granted-date {
    font-size: 0.75rem;
    color: #666;
  }

  .capabilities {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .capability-tag {
    padding: 0.25rem 0.5rem;
    background: rgba(139, 92, 246, 0.2);
    border-radius: 4px;
    font-size: 0.7rem;
    color: #a78bfa;
  }

  /* Settings */
  .settings-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .setting-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .setting-row:hover {
    background: rgba(0, 0, 0, 0.3);
  }

  .setting-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .setting-name {
    font-weight: 500;
    color: #fff;
  }

  .setting-desc {
    font-size: 0.75rem;
    color: #666;
  }

  .toggle {
    width: 44px;
    height: 24px;
    appearance: none;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    position: relative;
    cursor: pointer;
    transition: background 0.2s;
  }

  .toggle::before {
    content: '';
    position: absolute;
    width: 18px;
    height: 18px;
    background: #fff;
    border-radius: 50%;
    top: 3px;
    left: 3px;
    transition: transform 0.2s;
  }

  .toggle:checked {
    background: rgba(139, 92, 246, 0.8);
  }

  .toggle:checked::before {
    transform: translateX(20px);
  }

  @media (max-width: 640px) {
    .stats-grid {
      grid-template-columns: 1fr;
    }

    .tabs {
      overflow-x: auto;
    }
  }
</style>

<script lang="ts">
  import { onMount } from 'svelte';

  type Section = 'connection' | 'overview' | 'permissions' | 'data' | 'settings' | 'recovery' | 'principals';

  let { activeSection }: { activeSection: Section } = $props();
  let isConnected = $state(false);

  const navigation = [
    {
      label: 'Gateway',
      items: [
        { id: 'connection' as Section, label: 'Connection', icon: 'plug', href: '/manage/connection' },
        { id: 'overview' as Section, label: 'Overview', icon: 'chart', href: '/manage/overview' },
      ],
    },
    {
      label: 'Access',
      items: [{ id: 'permissions' as Section, label: 'App Permissions', icon: 'shield', href: '/manage/permissions' }],
    },
    {
      label: 'Storage',
      items: [{ id: 'data' as Section, label: 'Data Browser', icon: 'database', href: '/manage/data' }],
    },
    {
      label: 'System',
      items: [
        { id: 'principals' as Section, label: 'Principals', icon: 'users', href: '/manage/principals' },
        { id: 'settings' as Section, label: 'Settings', icon: 'gear', href: '/manage/settings' },
        { id: 'recovery' as Section, label: 'Recovery', icon: 'key', href: '/manage/recovery' },
      ],
    },
  ];

  onMount(() => {
    // Check connection status from localStorage
    const checkConnection = async () => {
      const apiKey = localStorage.getItem('federise:gateway:apiKey');
      const gatewayUrl = localStorage.getItem('federise:gateway:url');

      if (!apiKey || !gatewayUrl) {
        isConnected = false;
        return;
      }

      try {
        const response = await fetch(`${gatewayUrl}/ping`, {
          headers: { authorization: `ApiKey ${apiKey}` },
        });
        const data = (await response.json()) as { message?: string };
        isConnected = data?.message === 'pong';
      } catch {
        isConnected = false;
      }
    };

    checkConnection();

    // Recheck every 30 seconds
    const interval = setInterval(checkConnection, 30000);
    return () => clearInterval(interval);
  });
</script>

<aside class="sidebar">
  <div class="sidebar-header">
    <span class="logo">F</span>
    <span class="logo-text">Federise</span>
  </div>

  <nav class="nav">
    {#each navigation as group}
      <div class="nav-group">
        <span class="nav-group-label">{group.label}</span>
        {#each group.items as item}
          <a
            class="nav-item {activeSection === item.id ? 'active' : ''}"
            href={item.href}
          >
            <span class="nav-icon">
              {#if item.icon === 'plug'}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2v6" /><path d="M12 22v-6" />
                  <path d="M6 12H2" /><path d="M22 12h-4" />
                  <circle cx="12" cy="12" r="4" />
                </svg>
              {:else if item.icon === 'chart'}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 3v18h18" />
                  <path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" />
                </svg>
              {:else if item.icon === 'shield'}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              {:else if item.icon === 'database'}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <ellipse cx="12" cy="5" rx="9" ry="3" />
                  <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                  <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                </svg>
              {:else if item.icon === 'gear'}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
              {:else if item.icon === 'key'}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                </svg>
              {:else if item.icon === 'users'}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              {/if}
            </span>
            <span class="nav-label">{item.label}</span>
          </a>
        {/each}
      </div>
    {/each}
  </nav>

  <div class="sidebar-footer">
    <div class="connection-status {isConnected ? 'connected' : 'disconnected'}">
      <span class="status-dot"></span>
      <span>{isConnected ? 'Connected' : 'Not Connected'}</span>
    </div>
  </div>
</aside>

<style>
  .sidebar {
    width: 260px;
    background: var(--color-bg-subtle);
    border-right: 1px solid var(--border-subtle);
    display: flex;
    flex-direction: column;
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    z-index: 100;
  }

  .sidebar-header {
    padding: var(--space-xl);
    display: flex;
    align-items: center;
    gap: var(--space-md);
    border-bottom: 1px solid var(--border-subtle);
  }

  .logo {
    width: 36px;
    height: 36px;
    background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: var(--font-size-xl);
    color: var(--color-white);
  }

  .logo-text {
    font-weight: 600;
    font-size: 1.1rem;
    color: var(--color-white);
  }

  .nav {
    flex: 1;
    padding: 1rem 0;
    overflow-y: auto;
  }

  .nav-group {
    margin-bottom: 1.5rem;
  }

  .nav-group-label {
    display: block;
    padding: 0 var(--space-xl);
    margin-bottom: var(--space-sm);
    font-size: var(--font-size-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-subtle);
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    width: 100%;
    padding: 0.65rem var(--space-xl);
    background: none;
    border: none;
    color: var(--color-text);
    font-size: var(--font-size-md);
    cursor: pointer;
    transition: all var(--transition-fast);
    text-align: left;
    text-decoration: none;
  }

  .nav-item:hover {
    color: var(--color-white);
    background: var(--surface-1);
  }

  .nav-item.active {
    color: var(--color-white);
    background: var(--color-primary-light);
    border-right: 2px solid var(--color-primary);
  }

  .nav-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    color: inherit;
  }

  .sidebar-footer {
    padding: var(--space-lg) var(--space-xl);
    border-top: 1px solid var(--border-subtle);
  }

  .connection-status {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: var(--font-size-sm);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-full);
  }

  .connection-status.connected .status-dot {
    background: var(--color-success);
    box-shadow: 0 0 8px var(--color-success);
  }

  .connection-status.disconnected .status-dot {
    background: var(--color-text-subtle);
  }

  .connection-status.connected {
    color: var(--color-success);
  }

  .connection-status.disconnected {
    color: var(--color-text-subtle);
  }

  @media (max-width: 900px) {
    .sidebar {
      width: 70px;
    }

    .sidebar-header {
      justify-content: center;
    }

    .logo-text,
    .nav-group-label,
    .nav-label,
    .connection-status span:last-child {
      display: none;
    }

    .nav-item {
      justify-content: center;
      padding: 0.75rem;
    }
  }
</style>

<script lang="ts">
  import Sidebar from '../components/Sidebar.svelte';
  import Toast from '../components/Toast.svelte';

  type Section = 'connection' | 'overview' | 'permissions' | 'data' | 'settings' | 'recovery' | 'identities';

  let { activeSection, children }: { activeSection: Section; children: any } = $props();
</script>

<div class="dashboard">
  <Sidebar {activeSection} />
  <Toast />

  <main class="main-content">
    {@render children()}
  </main>
</div>

<style>
  .dashboard {
    display: flex;
    min-height: 100vh;
    background: var(--color-bg);
  }

  .main-content {
    flex: 1;
    margin-left: 260px;
    min-height: 100vh;
  }

  @media (max-width: 900px) {
    .main-content {
      margin-left: 70px;
    }
  }
</style>

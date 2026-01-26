// Components
export { default as GatewayConnection } from './components/GatewayConnection.svelte';
export { default as GatewayOverview } from './components/GatewayOverview.svelte';
export { default as IdentitiesManager } from './components/IdentitiesManager.svelte';
export { default as DataBrowser } from './components/DataBrowser.svelte';
export { default as Permissions } from './components/Permissions.svelte';
export { default as Recovery } from './components/Recovery.svelte';
export { default as Settings } from './components/Settings.svelte';
export { default as Sidebar } from './components/Sidebar.svelte';
export { default as Toast } from './components/Toast.svelte';
export { default as ManageLayout } from './layouts/ManageLayout.svelte';

// Utilities
export { createGatewayClient, withAuth } from './lib/client';
export * from './lib/permissions';
export * from './lib/kv-storage';
export * from './lib/protocol';
export { getPrimaryIdentity, getCredentials, hasIdentity } from './utils/vault';

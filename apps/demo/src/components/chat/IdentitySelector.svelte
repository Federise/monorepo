<script lang="ts">
  import { onMount } from 'svelte';
  import type { IdentityInfo } from '@federise/sdk';
  import {
    activeIdentity,
    getIdentitiesForCapability,
    selectIdentity,
    connectionState,
  } from '../../stores/federise.svelte';

  interface Props {
    channelId?: string;
  }

  let { channelId }: Props = $props();

  let availableIdentities = $state<IdentityInfo[]>([]);
  let isLoading = $state(false);
  let showDropdown = $state(false);
  let isSelecting = $state(false);
  let hasLoadedInitially = $state(false);

  async function loadIdentities() {
    isLoading = true;
    try {
      // Get identities that can read channels (or the specific channel)
      // When no channelId, queries for owner identities (general capability query)
      const identities = await getIdentitiesForCapability(
        'channel:read',
        channelId ? 'channel' : undefined,
        channelId
      );
      availableIdentities = identities;
      hasLoadedInitially = true;
    } catch (err) {
      console.error('Failed to load identities:', err);
      availableIdentities = [];
    } finally {
      isLoading = false;
    }
  }

  async function handleSelectIdentity(identity: IdentityInfo) {
    if (isSelecting) return;

    isSelecting = true;
    try {
      await selectIdentity(identity.identityId);
      showDropdown = false;
    } catch (err) {
      console.error('Failed to select identity:', err);
    } finally {
      isSelecting = false;
    }
  }

  function toggleDropdown() {
    showDropdown = !showDropdown;
    if (showDropdown && availableIdentities.length === 0) {
      loadIdentities();
    }
  }

  function closeDropdown(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.identity-selector')) {
      showDropdown = false;
    }
  }

  onMount(() => {
    document.addEventListener('click', closeDropdown);
    return () => document.removeEventListener('click', closeDropdown);
  });

  // Load identities when connection is established
  $effect(() => {
    if (connectionState.value === 'connected' && !hasLoadedInitially) {
      loadIdentities();
    }
  });

  // Reload identities when channel changes
  $effect(() => {
    if (channelId && hasLoadedInitially) {
      loadIdentities();
    }
  });
</script>

<div class="identity-selector">
  <button class="identity-button" onclick={toggleDropdown} title="Switch identity">
    <div class="identity-avatar">
      {#if activeIdentity.value}
        <span class="avatar-letter">{activeIdentity.value.displayName.charAt(0).toUpperCase()}</span>
      {:else}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      {/if}
    </div>
    <div class="identity-info">
      {#if activeIdentity.value}
        <span class="identity-name">{activeIdentity.value.displayName}</span>
        <span class="identity-source">{activeIdentity.value.source}</span>
      {:else}
        <span class="identity-name">No identity</span>
        <span class="identity-source">Select one</span>
      {/if}
    </div>
    <svg class="dropdown-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  </button>

  {#if showDropdown}
    <div class="dropdown-menu">
      <div class="dropdown-header">Select Identity</div>
      {#if isLoading}
        <div class="dropdown-loading">Loading...</div>
      {:else if availableIdentities.length === 0}
        <div class="dropdown-empty">No identities available</div>
      {:else}
        {#each availableIdentities as identity}
          <button
            class="dropdown-item"
            class:active={activeIdentity.value?.identityId === identity.identityId}
            onclick={() => handleSelectIdentity(identity)}
            disabled={isSelecting}
          >
            <div class="item-avatar">
              <span class="avatar-letter">{identity.displayName.charAt(0).toUpperCase()}</span>
            </div>
            <div class="item-info">
              <span class="item-name">{identity.displayName}</span>
              <span class="item-meta">
                {identity.identityType} · {identity.source}
                {#if identity.isPrimary}
                  <span class="primary-badge">primary</span>
                {/if}
              </span>
            </div>
            {#if activeIdentity.value?.identityId === identity.identityId}
              <svg class="check-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            {/if}
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .identity-selector {
    position: relative;
  }

  .identity-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    cursor: pointer;
    transition: all 0.15s;
  }

  .identity-button:hover {
    background: var(--color-surface-hover);
    border-color: var(--color-primary);
  }

  .identity-avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--color-primary);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
    font-weight: 600;
  }

  .identity-avatar svg {
    opacity: 0.7;
  }

  .identity-info {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
  }

  .identity-name {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text);
    line-height: 1.2;
  }

  .identity-source {
    font-size: 0.65rem;
    color: var(--color-text-muted);
    text-transform: capitalize;
  }

  .dropdown-icon {
    color: var(--color-text-muted);
    margin-left: auto;
  }

  .dropdown-menu {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 0.25rem;
    min-width: 220px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 100;
    overflow: hidden;
  }

  .dropdown-header {
    padding: 0.5rem 0.75rem;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
    background: var(--color-bg);
    border-bottom: 1px solid var(--color-border);
  }

  .dropdown-loading,
  .dropdown-empty {
    padding: 1rem;
    text-align: center;
    color: var(--color-text-muted);
    font-size: 0.8rem;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    padding: 0.625rem 0.75rem;
    background: transparent;
    border: none;
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
  }

  .dropdown-item:hover {
    background: var(--color-surface-hover);
  }

  .dropdown-item.active {
    background: rgba(var(--color-primary-rgb, 99, 102, 241), 0.1);
  }

  .dropdown-item:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .item-avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--color-primary);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 600;
    flex-shrink: 0;
  }

  .item-info {
    flex: 1;
    min-width: 0;
  }

  .item-name {
    display: block;
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--color-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-meta {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.7rem;
    color: var(--color-text-muted);
    text-transform: capitalize;
  }

  .primary-badge {
    padding: 0.1rem 0.3rem;
    background: var(--color-success, #22c55e);
    color: white;
    font-size: 0.6rem;
    font-weight: 600;
    border-radius: 3px;
    text-transform: uppercase;
  }

  .check-icon {
    color: var(--color-primary);
    flex-shrink: 0;
  }
</style>

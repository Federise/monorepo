import { createGatewayClient, withAuth } from '../api/client';
import { getCredentials } from '../utils/vault';
import type { ChannelMeta, ChannelEvent, ChannelCreateResult, ChannelReadResult, ChannelPermissionInput } from '@federise/sdk';

/**
 * Get the gateway client and auth config.
 * Throws if no identity is configured.
 */
function getClient() {
  const { apiKey, gatewayUrl } = getCredentials();
  return { client: createGatewayClient(gatewayUrl), apiKey };
}

/**
 * Build a namespaced key for origin isolation.
 * Each origin gets its own namespace to prevent cross-origin data access.
 * Uses a hash of the origin to create a safe, consistent namespace.
 */
async function buildNamespace(origin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(origin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `origin_${hashHex}`;
}

/**
 * Create a new channel for the given origin.
 */
export async function createChannel(origin: string, name: string): Promise<ChannelCreateResult> {
  const { client, apiKey } = getClient();
  const namespace = await buildNamespace(origin);

  const { data, error } = await client.POST('/channel/create', {
    ...withAuth(apiKey),
    body: { namespace, name },
  });

  if (error) {
    console.error('[Channel] Failed to create:', error);
    throw new Error('Failed to create channel');
  }

  return data as ChannelCreateResult;
}

/**
 * List all channels for the given origin.
 */
export async function listChannels(origin: string): Promise<ChannelMeta[]> {
  const { client, apiKey } = getClient();
  const namespace = await buildNamespace(origin);

  const { data, error } = await client.POST('/channel/list', {
    ...withAuth(apiKey),
    body: { namespace },
  });

  if (error) {
    console.error('[Channel] Failed to list:', error);
    throw new Error('Failed to list channels');
  }

  return (data as { channels: ChannelMeta[] }).channels;
}

/**
 * Append an event to a channel.
 */
export async function appendChannel(
  origin: string,
  channelId: string,
  content: string
): Promise<ChannelEvent> {
  const { client, apiKey } = getClient();

  // Owner uses "Owner" as authorId for readable display
  const authorId = 'Owner';

  const { data, error } = await client.POST('/channel/append', {
    ...withAuth(apiKey),
    body: { channelId, authorId, content },
  });

  if (error) {
    console.error('[Channel] Failed to append:', error);
    throw new Error('Failed to append to channel');
  }

  return (data as { event: ChannelEvent }).event;
}

/**
 * Read events from a channel.
 */
export async function readChannel(
  origin: string,
  channelId: string,
  afterSeq?: number,
  limit?: number
): Promise<ChannelReadResult> {
  const { client, apiKey } = getClient();
  // Origin not used for read, but kept for consistency

  const { data, error } = await client.POST('/channel/read', {
    ...withAuth(apiKey),
    body: { channelId, afterSeq, limit },
  });

  if (error) {
    console.error('[Channel] Failed to read:', error);
    throw new Error('Failed to read channel');
  }

  return data as ChannelReadResult;
}

/**
 * Delete a channel and all its events.
 */
export async function deleteChannel(origin: string, channelId: string): Promise<void> {
  const { client, apiKey } = getClient();
  const namespace = await buildNamespace(origin);

  const { error } = await client.POST('/channel/delete', {
    ...withAuth(apiKey),
    body: { namespace, channelId },
  });

  if (error) {
    console.error('[Channel] Failed to delete:', error);
    throw new Error('Failed to delete channel');
  }
}

/**
 * Soft-delete an event in a channel.
 */
export async function deleteChannelEvent(
  origin: string,
  channelId: string,
  targetSeq: number
): Promise<ChannelEvent> {
  const { client, apiKey } = getClient();

  // Owner uses "Owner" as authorId for readable display
  const authorId = 'Owner';

  const { data, error } = await client.POST('/channel/delete-event', {
    ...withAuth(apiKey),
    body: { channelId, targetSeq, authorId },
  });

  if (error) {
    console.error('[Channel] Failed to delete event:', error);
    throw new Error('Failed to delete channel event');
  }

  return (data as { event: ChannelEvent }).event;
}

/**
 * Create a capability token for sharing a channel.
 */
export async function createChannelToken(
  origin: string,
  channelId: string,
  permissions: ChannelPermissionInput[],
  options?: { displayName?: string; expiresInSeconds?: number }
): Promise<{ token: string; expiresAt: string }> {
  const { client, apiKey } = getClient();
  const namespace = await buildNamespace(origin);

  const { data, error } = await client.POST('/channel/token/create', {
    ...withAuth(apiKey),
    body: {
      namespace,
      channelId,
      // Cast permissions - gateway handles 'write' → 'append' conversion
      permissions: permissions as ('read' | 'append' | 'delete:own' | 'delete:any' | 'read:deleted')[],
      displayName: options?.displayName,
      expiresInSeconds: options?.expiresInSeconds,
    },
  });

  if (error) {
    console.error('[Channel] Failed to create token:', error);
    throw new Error('Failed to create channel token');
  }

  return data as { token: string; expiresAt: string };
}

import { createGatewayClient, withAuth } from '../api/client';
import { getGatewayConfig } from '../utils/auth';
import type { LogMeta, LogEvent, LogCreateResult, LogReadResult } from '@federise/sdk';

/**
 * Get the gateway client and auth config.
 * Throws if gateway is not configured.
 */
function getClient() {
  const { apiKey, url } = getGatewayConfig();
  if (!apiKey || !url) {
    throw new Error('Gateway not configured. API key and URL are required.');
  }
  return { client: createGatewayClient(url), apiKey };
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
 * Create a new log for the given origin.
 */
export async function createLog(origin: string, name: string): Promise<LogCreateResult> {
  const { client, apiKey } = getClient();
  const namespace = await buildNamespace(origin);

  const { data, error } = await client.POST('/log/create', {
    ...withAuth(apiKey),
    body: { namespace, name },
  });

  if (error) {
    console.error('[Log] Failed to create:', error);
    throw new Error('Failed to create log');
  }

  return data as LogCreateResult;
}

/**
 * List all logs for the given origin.
 */
export async function listLogs(origin: string): Promise<LogMeta[]> {
  const { client, apiKey } = getClient();
  const namespace = await buildNamespace(origin);

  const { data, error } = await client.POST('/log/list', {
    ...withAuth(apiKey),
    body: { namespace },
  });

  if (error) {
    console.error('[Log] Failed to list:', error);
    throw new Error('Failed to list logs');
  }

  return (data as { logs: LogMeta[] }).logs;
}

/**
 * Append an event to a log.
 */
export async function appendLog(
  origin: string,
  logId: string,
  content: string
): Promise<LogEvent> {
  const { client, apiKey } = getClient();
  const namespace = await buildNamespace(origin);

  // For owner access, use namespace as authorId
  const authorId = namespace;

  const { data, error } = await client.POST('/log/append', {
    ...withAuth(apiKey),
    body: { logId, authorId, content },
  });

  if (error) {
    console.error('[Log] Failed to append:', error);
    throw new Error('Failed to append to log');
  }

  return (data as { event: LogEvent }).event;
}

/**
 * Read events from a log.
 */
export async function readLog(
  origin: string,
  logId: string,
  afterSeq?: number,
  limit?: number
): Promise<LogReadResult> {
  const { client, apiKey } = getClient();
  // Origin not used for read, but kept for consistency

  const { data, error } = await client.POST('/log/read', {
    ...withAuth(apiKey),
    body: { logId, afterSeq, limit },
  });

  if (error) {
    console.error('[Log] Failed to read:', error);
    throw new Error('Failed to read log');
  }

  return data as LogReadResult;
}

/**
 * Create a capability token for sharing a log.
 */
export async function createLogToken(
  origin: string,
  logId: string,
  permissions: ('read' | 'write')[],
  expiresInSeconds?: number
): Promise<{ token: string; expiresAt: string }> {
  const { client, apiKey } = getClient();
  const namespace = await buildNamespace(origin);

  // Generate a unique authorId for this token recipient
  const authorId = `recipient_${crypto.randomUUID().slice(0, 8)}`;

  const { data, error } = await client.POST('/log/token/create', {
    ...withAuth(apiKey),
    body: {
      namespace,
      logId,
      permissions,
      authorId,
      expiresInSeconds,
    },
  });

  if (error) {
    console.error('[Log] Failed to create token:', error);
    throw new Error('Failed to create log token');
  }

  return data as { token: string; expiresAt: string };
}

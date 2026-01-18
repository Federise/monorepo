/**
 * RemoteBackend - HTTP-based implementation of ProxyBackend.
 *
 * Makes requests to the Federise gateway API for all storage operations.
 */

import type {
  ProxyBackend,
  BlobUploadOptions,
  PresignUploadResult,
  ChannelCreateResult,
  TokenCreateOptions,
  TokenResult,
  TokenLookupResult,
  InviteToChannelResult,
  RegisterAppResult,
  BlobMetadata,
  ChannelMeta,
  ChannelEvent,
  ChannelReadResult,
  BlobVisibility,
  ChannelPermissionInput,
} from '../types';

/**
 * Options for RemoteBackend construction.
 */
export interface RemoteBackendOptions {
  /** URL of the gateway API (e.g., "http://localhost:3000") */
  gatewayUrl: string;
  /** API key for authentication */
  apiKey: string;
}

/**
 * RemoteBackend implements ProxyBackend using HTTP calls to the gateway.
 */
export class RemoteBackend implements ProxyBackend {
  private gatewayUrl: string;
  private apiKey: string;

  constructor(options: RemoteBackendOptions) {
    this.gatewayUrl = options.gatewayUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = options.apiKey;
  }

  /**
   * Make a POST request to the gateway.
   */
  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.gatewayUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `ApiKey ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  // KV Operations

  async kvGet(namespace: string, key: string): Promise<string | null> {
    const data = await this.post<{ value: string | null }>('/kv/get', { namespace, key });
    return data?.value ?? null;
  }

  async kvSet(namespace: string, key: string, value: string): Promise<void> {
    await this.post('/kv/set', { namespace, key, value });
  }

  async kvDelete(namespace: string, key: string): Promise<void> {
    // Gateway uses set with empty value for delete
    await this.post('/kv/set', { namespace, key, value: '' });
  }

  async kvKeys(namespace: string, prefix?: string): Promise<string[]> {
    const keys = await this.post<string[]>('/kv/keys', { namespace });

    // Filter by prefix if provided
    if (prefix) {
      return (keys ?? []).filter((key: string) => key.startsWith(prefix));
    }

    return keys ?? [];
  }

  // Blob Operations

  async blobUpload(
    namespace: string,
    key: string,
    contentType: string,
    data: ArrayBuffer,
    options: BlobUploadOptions
  ): Promise<BlobMetadata> {
    // Gateway expects raw binary body with metadata in headers
    const response = await fetch(`${this.gatewayUrl}/blob/upload`, {
      method: 'POST',
      headers: {
        Authorization: `ApiKey ${this.apiKey}`,
        'Content-Type': contentType,
        'X-Blob-Namespace': namespace,
        'X-Blob-Key': key,
        ...(options.visibility && { 'X-Blob-Visibility': options.visibility }),
        ...(options.isPublic !== undefined && { 'X-Blob-Public': String(options.isPublic) }),
      },
      body: data,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    const result = await response.json() as { metadata: BlobMetadata };
    return result.metadata;
  }

  async blobGet(
    namespace: string,
    key: string
  ): Promise<{ url: string; metadata: BlobMetadata }> {
    return this.post<{ url: string; metadata: BlobMetadata }>('/blob/get', { namespace, key });
  }

  async blobDelete(namespace: string, key: string): Promise<void> {
    await this.post('/blob/delete', { namespace, key });
  }

  async blobList(namespace: string): Promise<BlobMetadata[]> {
    const data = await this.post<{ blobs: BlobMetadata[] }>('/blob/list', { namespace });
    return data?.blobs ?? [];
  }

  async blobPresignUpload(
    namespace: string,
    key: string,
    contentType: string,
    size: number,
    options: BlobUploadOptions
  ): Promise<PresignUploadResult | null> {
    try {
      const data = await this.post<{ uploadUrl: string; metadata: BlobMetadata; expiresAt: string }>(
        '/blob/presign-upload',
        {
          namespace,
          key,
          contentType,
          size,
          visibility: options.visibility,
          isPublic: options.isPublic,
        }
      );

      return {
        uploadUrl: data.uploadUrl,
        metadata: data.metadata,
        expiresAt: data.expiresAt,
      };
    } catch {
      // Presigned uploads may not be available
      return null;
    }
  }

  async blobSetVisibility(
    namespace: string,
    key: string,
    visibility: BlobVisibility
  ): Promise<BlobMetadata> {
    const data = await this.post<{ metadata: BlobMetadata }>('/blob/visibility', {
      namespace,
      key,
      visibility,
    });
    return data.metadata;
  }

  // Channel Operations

  async channelCreate(namespace: string, name: string): Promise<ChannelCreateResult> {
    return this.post<ChannelCreateResult>('/channel/create', { namespace, name });
  }

  async channelList(namespace: string): Promise<ChannelMeta[]> {
    const data = await this.post<{ channels: ChannelMeta[] }>('/channel/list', { namespace });
    return data?.channels ?? [];
  }

  async channelAppend(
    namespace: string,
    channelId: string,
    content: string,
    authorId?: string
  ): Promise<ChannelEvent> {
    // Gateway expects channelId, content, and authorId (required for API key auth)
    const data = await this.post<{ event: ChannelEvent }>('/channel/append', {
      channelId,
      content,
      authorId: authorId || 'anonymous',
    });
    return data.event;
  }

  async channelRead(
    namespace: string,
    channelId: string,
    afterSeq?: number,
    limit?: number
  ): Promise<ChannelReadResult> {
    // Gateway only expects channelId, afterSeq, limit (namespace is implicit from API key)
    return this.post<ChannelReadResult>('/channel/read', {
      channelId,
      afterSeq,
      limit,
    });
  }

  async channelDelete(namespace: string, channelId: string): Promise<void> {
    await this.post('/channel/delete', { namespace, channelId });
  }

  async channelDeleteEvent(
    namespace: string,
    channelId: string,
    targetSeq: number,
    authorId?: string
  ): Promise<ChannelEvent> {
    // Gateway expects channelId, targetSeq, and authorId (required for API key auth)
    const data = await this.post<{ event: ChannelEvent }>('/channel/delete-event', {
      channelId,
      targetSeq,
      authorId: authorId || 'anonymous',
    });
    return data.event;
  }

  async channelCreateToken(
    namespace: string,
    channelId: string,
    permissions: ChannelPermissionInput[],
    options?: TokenCreateOptions
  ): Promise<TokenResult> {
    // Gateway expects namespace, channelId, permissions, displayName, expiresInSeconds
    const data = await this.post<{ token: string; expiresAt: string }>('/channel/token/create', {
      namespace,
      channelId,
      permissions,
      displayName: options?.displayName,
      expiresInSeconds: options?.expiresInSeconds,
    });

    return {
      token: data.token,
      expiresAt: data.expiresAt,
    };
  }

  async channelInvite(
    namespace: string,
    channelId: string,
    displayName: string,
    permissions: ChannelPermissionInput[],
    options?: { expiresInSeconds?: number }
  ): Promise<InviteToChannelResult> {
    // Gateway expects namespace, channelId, displayName, permissions, expiresInSeconds
    return this.post<InviteToChannelResult>('/identity/invite', {
      namespace,
      channelId,
      displayName,
      permissions,
      expiresInSeconds: options?.expiresInSeconds,
    });
  }

  // Token Operations

  async tokenLookup(tokenId: string, gatewayUrl?: string): Promise<TokenLookupResult> {
    // Use provided gateway URL or fall back to configured one
    const baseUrl = gatewayUrl ? gatewayUrl.replace(/\/$/, '') : this.gatewayUrl;

    try {
      const response = await fetch(`${baseUrl}/token/lookup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Note: Token lookup may not require auth - the token itself is the secret
        },
        body: JSON.stringify({ tokenId }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Unknown error' }));
        return { valid: false, error: error.message || `HTTP ${response.status}` };
      }

      return response.json();
    } catch (err) {
      return { valid: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  // Identity Operations

  async registerApp(
    origin: string,
    capabilities: string[],
    displayName?: string
  ): Promise<RegisterAppResult> {
    return this.post<RegisterAppResult>('/identity/app/register', {
      origin,
      capabilities,
      displayName,
    });
  }
}

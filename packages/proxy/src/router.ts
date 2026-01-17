/**
 * MessageRouter - Core message routing logic for the proxy.
 *
 * Routes messages from SDK clients to the appropriate backend operations,
 * enforcing capability checks along the way.
 */

import { isValidRequest, PROTOCOL_VERSION } from '@federise/sdk';
import type {
  RequestMessage,
  ResponseMessage,
  Capability,
  ProxyBackend,
  CapabilityStore,
  TokenCreateOptions,
} from './types';
import { buildNamespace } from './namespace';

/**
 * Options for MessageRouter construction.
 */
export interface MessageRouterOptions {
  backend: ProxyBackend;
  capabilities: CapabilityStore;
  /**
   * Called when capability approval is needed.
   * Should return the authorization URL to redirect to.
   */
  onAuthRequired?: (
    origin: string,
    requestedCapabilities: Capability[],
    alreadyGranted: Capability[]
  ) => Promise<string>;
  /**
   * Get the gateway URL for token creation responses.
   */
  getGatewayUrl?: () => string;
  /**
   * Enable test-only messages (TEST_GRANT_PERMISSIONS, TEST_CLEAR_PERMISSIONS).
   * Only enable in development mode.
   */
  enableTestMessages?: boolean;
  /**
   * Origins allowed to use test messages.
   */
  testMessageOrigins?: string[];
}

/**
 * Channel secrets cache for token creation.
 * Maps `${namespace}:${channelId}` to secret.
 */
type ChannelSecretsCache = Map<string, string>;

/**
 * MessageRouter handles incoming messages and routes them to the backend.
 */
export class MessageRouter {
  private backend: ProxyBackend;
  private capabilities: CapabilityStore;
  private onAuthRequired?: MessageRouterOptions['onAuthRequired'];
  private getGatewayUrl?: () => string;
  private enableTestMessages: boolean;
  private testMessageOrigins: Set<string>;

  /**
   * Cache of channel secrets for token creation.
   * When a channel is created, its secret is stored here.
   */
  private channelSecrets: ChannelSecretsCache = new Map();

  constructor(options: MessageRouterOptions) {
    this.backend = options.backend;
    this.capabilities = options.capabilities;
    this.onAuthRequired = options.onAuthRequired;
    this.getGatewayUrl = options.getGatewayUrl;
    this.enableTestMessages = options.enableTestMessages ?? false;
    this.testMessageOrigins = new Set(options.testMessageOrigins ?? []);
  }

  /**
   * Handle an incoming message from a client.
   *
   * @param origin - The origin of the message sender
   * @param message - The raw message data
   * @returns The response message to send back
   */
  async handleMessage(origin: string, message: unknown): Promise<ResponseMessage> {
    // Validate message format
    if (!isValidRequest(message)) {
      const id = (message as { id?: string })?.id ?? 'unknown';
      return { type: 'ERROR', id, code: 'INVALID_MESSAGE', message: 'Invalid message format' };
    }

    const msg = message as RequestMessage;

    try {
      const namespace = await buildNamespace(origin);
      return await this.routeMessage(origin, namespace, msg);
    } catch (err) {
      console.error('[MessageRouter] Error handling message:', err);
      return {
        type: 'ERROR',
        id: msg.id,
        code: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  /**
   * Route a validated message to the appropriate handler.
   */
  private async routeMessage(
    origin: string,
    namespace: string,
    msg: RequestMessage
  ): Promise<ResponseMessage> {
    switch (msg.type) {
      case 'SYN':
        return this.handleSyn(origin, msg);

      case 'REQUEST_CAPABILITIES':
        return this.handleRequestCapabilities(origin, msg);

      case 'KV_GET':
        return this.handleKVGet(origin, namespace, msg);

      case 'KV_SET':
        return this.handleKVSet(origin, namespace, msg);

      case 'KV_DELETE':
        return this.handleKVDelete(origin, namespace, msg);

      case 'KV_KEYS':
        return this.handleKVKeys(origin, namespace, msg);

      case 'BLOB_UPLOAD':
        return this.handleBlobUpload(origin, namespace, msg);

      case 'BLOB_GET':
        return this.handleBlobGet(origin, namespace, msg);

      case 'BLOB_DELETE':
        return this.handleBlobDelete(origin, namespace, msg);

      case 'BLOB_LIST':
        return this.handleBlobList(origin, namespace, msg);

      case 'BLOB_GET_UPLOAD_URL':
        return this.handleBlobGetUploadUrl(origin, namespace, msg);

      case 'BLOB_SET_VISIBILITY':
        return this.handleBlobSetVisibility(origin, namespace, msg);

      case 'CHANNEL_CREATE':
        return this.handleChannelCreate(origin, namespace, msg);

      case 'CHANNEL_LIST':
        return this.handleChannelList(origin, namespace, msg);

      case 'CHANNEL_APPEND':
        return this.handleChannelAppend(origin, namespace, msg);

      case 'CHANNEL_READ':
        return this.handleChannelRead(origin, namespace, msg);

      case 'CHANNEL_DELETE':
        return this.handleChannelDelete(origin, namespace, msg);

      case 'CHANNEL_DELETE_EVENT':
        return this.handleChannelDeleteEvent(origin, namespace, msg);

      case 'CHANNEL_TOKEN_CREATE':
        return this.handleChannelTokenCreate(origin, namespace, msg);

      case 'TEST_GRANT_PERMISSIONS':
        return this.handleTestGrantPermissions(origin, msg);

      case 'TEST_CLEAR_PERMISSIONS':
        return this.handleTestClearPermissions(origin, msg);

      default:
        return {
          type: 'ERROR',
          id: (msg as { id: string }).id,
          code: 'UNKNOWN_MESSAGE_TYPE',
          message: `Unknown message type: ${(msg as { type: string }).type}`,
        };
    }
  }

  /**
   * Check if origin has a required capability, returning a PERMISSION_DENIED response if not.
   */
  private async checkCapability(
    origin: string,
    capability: Capability,
    msgId: string
  ): Promise<ResponseMessage | null> {
    if (await this.capabilities.hasCapability(origin, capability)) {
      return null; // Has capability
    }
    return {
      type: 'PERMISSION_DENIED',
      id: msgId,
      capability,
    };
  }

  // --- Handlers ---

  private async handleSyn(
    origin: string,
    msg: Extract<RequestMessage, { type: 'SYN' }>
  ): Promise<ResponseMessage> {
    const capabilities = await this.capabilities.getCapabilities(origin);
    return {
      type: 'ACK',
      id: msg.id,
      version: PROTOCOL_VERSION,
      capabilities,
    };
  }

  private async handleRequestCapabilities(
    origin: string,
    msg: Extract<RequestMessage, { type: 'REQUEST_CAPABILITIES' }>
  ): Promise<ResponseMessage> {
    const granted = await this.capabilities.getCapabilities(origin);
    const requested = msg.capabilities;

    const alreadyGranted = requested.filter((c) => granted.includes(c));
    const needsApproval = requested.filter((c) => !granted.includes(c));

    // All capabilities already granted
    if (needsApproval.length === 0) {
      return {
        type: 'CAPABILITIES_GRANTED',
        id: msg.id,
        granted: alreadyGranted,
      };
    }

    // Need user approval
    if (this.onAuthRequired) {
      const authUrl = await this.onAuthRequired(origin, requested, granted);
      return {
        type: 'AUTH_REQUIRED',
        id: msg.id,
        url: authUrl,
        granted: alreadyGranted,
      };
    }

    // No auth handler configured
    return {
      type: 'ERROR',
      id: msg.id,
      code: 'AUTH_NOT_CONFIGURED',
      message: 'Authorization not configured',
    };
  }

  private async handleKVGet(
    origin: string,
    namespace: string,
    msg: Extract<RequestMessage, { type: 'KV_GET' }>
  ): Promise<ResponseMessage> {
    const denied = await this.checkCapability(origin, 'kv:read', msg.id);
    if (denied) return denied;

    const value = await this.backend.kvGet(namespace, msg.key);
    return {
      type: 'KV_RESULT',
      id: msg.id,
      value,
    };
  }

  private async handleKVSet(
    origin: string,
    namespace: string,
    msg: Extract<RequestMessage, { type: 'KV_SET' }>
  ): Promise<ResponseMessage> {
    const denied = await this.checkCapability(origin, 'kv:write', msg.id);
    if (denied) return denied;

    await this.backend.kvSet(namespace, msg.key, msg.value);
    return {
      type: 'KV_OK',
      id: msg.id,
    };
  }

  private async handleKVDelete(
    origin: string,
    namespace: string,
    msg: Extract<RequestMessage, { type: 'KV_DELETE' }>
  ): Promise<ResponseMessage> {
    const denied = await this.checkCapability(origin, 'kv:delete', msg.id);
    if (denied) return denied;

    await this.backend.kvDelete(namespace, msg.key);
    return {
      type: 'KV_OK',
      id: msg.id,
    };
  }

  private async handleKVKeys(
    origin: string,
    namespace: string,
    msg: Extract<RequestMessage, { type: 'KV_KEYS' }>
  ): Promise<ResponseMessage> {
    const denied = await this.checkCapability(origin, 'kv:read', msg.id);
    if (denied) return denied;

    const keys = await this.backend.kvKeys(namespace, msg.prefix);
    return {
      type: 'KV_KEYS_RESULT',
      id: msg.id,
      keys,
    };
  }

  private async handleBlobUpload(
    origin: string,
    namespace: string,
    msg: Extract<RequestMessage, { type: 'BLOB_UPLOAD' }>
  ): Promise<ResponseMessage> {
    const denied = await this.checkCapability(origin, 'blob:write', msg.id);
    if (denied) return denied;

    const metadata = await this.backend.blobUpload(namespace, msg.key, msg.contentType, msg.data, {
      visibility: msg.visibility,
      isPublic: msg.isPublic,
    });
    return {
      type: 'BLOB_UPLOADED',
      id: msg.id,
      metadata,
    };
  }

  private async handleBlobGet(
    origin: string,
    namespace: string,
    msg: Extract<RequestMessage, { type: 'BLOB_GET' }>
  ): Promise<ResponseMessage> {
    const denied = await this.checkCapability(origin, 'blob:read', msg.id);
    if (denied) return denied;

    try {
      const result = await this.backend.blobGet(namespace, msg.key);
      return {
        type: 'BLOB_DOWNLOAD_URL',
        id: msg.id,
        url: result.url,
        metadata: result.metadata,
      };
    } catch (err) {
      return {
        type: 'ERROR',
        id: msg.id,
        code: 'NOT_FOUND',
        message: 'Blob not found',
      };
    }
  }

  private async handleBlobDelete(
    origin: string,
    namespace: string,
    msg: Extract<RequestMessage, { type: 'BLOB_DELETE' }>
  ): Promise<ResponseMessage> {
    const denied = await this.checkCapability(origin, 'blob:write', msg.id);
    if (denied) return denied;

    await this.backend.blobDelete(namespace, msg.key);
    return {
      type: 'BLOB_OK',
      id: msg.id,
    };
  }

  private async handleBlobList(
    origin: string,
    namespace: string,
    msg: Extract<RequestMessage, { type: 'BLOB_LIST' }>
  ): Promise<ResponseMessage> {
    const denied = await this.checkCapability(origin, 'blob:read', msg.id);
    if (denied) return denied;

    const blobs = await this.backend.blobList(namespace);
    return {
      type: 'BLOB_LIST_RESULT',
      id: msg.id,
      blobs,
    };
  }

  private async handleBlobGetUploadUrl(
    origin: string,
    namespace: string,
    msg: Extract<RequestMessage, { type: 'BLOB_GET_UPLOAD_URL' }>
  ): Promise<ResponseMessage> {
    const denied = await this.checkCapability(origin, 'blob:write', msg.id);
    if (denied) return denied;

    const result = await this.backend.blobPresignUpload(namespace, msg.key, msg.contentType, msg.size, {
      visibility: msg.visibility,
      isPublic: msg.isPublic,
    });

    if (!result) {
      return {
        type: 'ERROR',
        id: msg.id,
        code: 'PRESIGN_NOT_AVAILABLE',
        message: 'Presigned uploads not configured',
      };
    }

    return {
      type: 'BLOB_UPLOAD_URL',
      id: msg.id,
      uploadUrl: result.uploadUrl,
      metadata: result.metadata,
    };
  }

  private async handleBlobSetVisibility(
    origin: string,
    namespace: string,
    msg: Extract<RequestMessage, { type: 'BLOB_SET_VISIBILITY' }>
  ): Promise<ResponseMessage> {
    const denied = await this.checkCapability(origin, 'blob:write', msg.id);
    if (denied) return denied;

    const metadata = await this.backend.blobSetVisibility(namespace, msg.key, msg.visibility);
    return {
      type: 'BLOB_VISIBILITY_SET',
      id: msg.id,
      metadata,
    };
  }

  private async handleChannelCreate(
    origin: string,
    namespace: string,
    msg: Extract<RequestMessage, { type: 'CHANNEL_CREATE' }>
  ): Promise<ResponseMessage> {
    const denied = await this.checkCapability(origin, 'channel:create', msg.id);
    if (denied) return denied;

    const result = await this.backend.channelCreate(namespace, msg.name);

    // Cache the secret for token creation
    const cacheKey = `${namespace}:${result.metadata.channelId}`;
    this.channelSecrets.set(cacheKey, result.secret);

    return {
      type: 'CHANNEL_CREATED',
      id: msg.id,
      metadata: result.metadata,
      secret: result.secret,
    };
  }

  private async handleChannelList(
    origin: string,
    namespace: string,
    msg: Extract<RequestMessage, { type: 'CHANNEL_LIST' }>
  ): Promise<ResponseMessage> {
    const denied = await this.checkCapability(origin, 'channel:create', msg.id);
    if (denied) return denied;

    const channels = await this.backend.channelList(namespace);
    return {
      type: 'CHANNEL_LIST_RESULT',
      id: msg.id,
      channels,
    };
  }

  private async handleChannelAppend(
    origin: string,
    namespace: string,
    msg: Extract<RequestMessage, { type: 'CHANNEL_APPEND' }>
  ): Promise<ResponseMessage> {
    const denied = await this.checkCapability(origin, 'channel:create', msg.id);
    if (denied) return denied;

    const event = await this.backend.channelAppend(namespace, msg.channelId, msg.content);
    return {
      type: 'CHANNEL_APPENDED',
      id: msg.id,
      event,
    };
  }

  private async handleChannelRead(
    origin: string,
    namespace: string,
    msg: Extract<RequestMessage, { type: 'CHANNEL_READ' }>
  ): Promise<ResponseMessage> {
    const denied = await this.checkCapability(origin, 'channel:create', msg.id);
    if (denied) return denied;

    const result = await this.backend.channelRead(namespace, msg.channelId, msg.afterSeq, msg.limit);
    return {
      type: 'CHANNEL_READ_RESULT',
      id: msg.id,
      events: result.events,
      hasMore: result.hasMore,
    };
  }

  private async handleChannelDelete(
    origin: string,
    namespace: string,
    msg: Extract<RequestMessage, { type: 'CHANNEL_DELETE' }>
  ): Promise<ResponseMessage> {
    const denied = await this.checkCapability(origin, 'channel:delete', msg.id);
    if (denied) return denied;

    await this.backend.channelDelete(namespace, msg.channelId);

    // Remove cached secret
    const cacheKey = `${namespace}:${msg.channelId}`;
    this.channelSecrets.delete(cacheKey);

    return {
      type: 'CHANNEL_DELETED',
      id: msg.id,
    };
  }

  private async handleChannelDeleteEvent(
    origin: string,
    namespace: string,
    msg: Extract<RequestMessage, { type: 'CHANNEL_DELETE_EVENT' }>
  ): Promise<ResponseMessage> {
    const denied = await this.checkCapability(origin, 'channel:create', msg.id);
    if (denied) return denied;

    const event = await this.backend.channelDeleteEvent(namespace, msg.channelId, msg.targetSeq);
    return {
      type: 'CHANNEL_EVENT_DELETED',
      id: msg.id,
      event,
    };
  }

  private async handleChannelTokenCreate(
    origin: string,
    namespace: string,
    msg: Extract<RequestMessage, { type: 'CHANNEL_TOKEN_CREATE' }>
  ): Promise<ResponseMessage> {
    const denied = await this.checkCapability(origin, 'channel:create', msg.id);
    if (denied) return denied;

    const result = await this.backend.channelCreateToken(namespace, msg.channelId, msg.permissions, {
      displayName: msg.displayName,
      expiresInSeconds: msg.expiresInSeconds,
    });

    const gatewayUrl = this.getGatewayUrl?.() ?? '';

    return {
      type: 'CHANNEL_TOKEN_CREATED',
      id: msg.id,
      token: result.token,
      expiresAt: result.expiresAt,
      gatewayUrl,
    };
  }

  private async handleTestGrantPermissions(
    origin: string,
    msg: Extract<RequestMessage, { type: 'TEST_GRANT_PERMISSIONS' }>
  ): Promise<ResponseMessage> {
    // Only allow in test mode from allowed origins
    if (!this.enableTestMessages || !this.testMessageOrigins.has(origin)) {
      return {
        type: 'ERROR',
        id: msg.id,
        code: 'FORBIDDEN',
        message: 'Test messages only allowed from test harness',
      };
    }

    await this.capabilities.grantCapabilities(origin, msg.capabilities);
    return {
      type: 'TEST_PERMISSIONS_GRANTED',
      id: msg.id,
    };
  }

  private async handleTestClearPermissions(
    origin: string,
    msg: Extract<RequestMessage, { type: 'TEST_CLEAR_PERMISSIONS' }>
  ): Promise<ResponseMessage> {
    // Only allow in test mode from allowed origins
    if (!this.enableTestMessages || !this.testMessageOrigins.has(origin)) {
      return {
        type: 'ERROR',
        id: msg.id,
        code: 'FORBIDDEN',
        message: 'Test messages only allowed from test harness',
      };
    }

    await this.capabilities.revokeCapabilities(origin);
    return {
      type: 'TEST_PERMISSIONS_CLEARED',
      id: msg.id,
    };
  }

  /**
   * Manually cache a channel secret (useful when loading from storage).
   */
  cacheChannelSecret(namespace: string, channelId: string, secret: string): void {
    const cacheKey = `${namespace}:${channelId}`;
    this.channelSecrets.set(cacheKey, secret);
  }

  /**
   * Clear a cached channel secret.
   */
  clearChannelSecret(namespace: string, channelId: string): void {
    const cacheKey = `${namespace}:${channelId}`;
    this.channelSecrets.delete(cacheKey);
  }
}

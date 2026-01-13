<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    type RequestMessage,
    type ResponseMessage,
    type Capability,
    PROTOCOL_VERSION,
    isValidRequest,
  } from '../lib/protocol';
  import { getPermissions, hasCapability, grantCapabilities, revokePermissions } from '../lib/permissions';
  import { getKV, setKV, deleteKV, listKVKeys } from '../lib/kv-storage';
  import { uploadBlob, getBlob, deleteBlob, listBlobs, getUploadUrlWithMetadata, setBlobVisibility } from '../lib/blob-storage';
  import { createLog, listLogs, appendLog, readLog, deleteLog, createLogToken } from '../lib/log-storage';
  import { checkStorageAccess, requestStorageAccess, isGatewayConfigured, getGatewayConfig } from '../utils/auth';

  // Track connected clients by origin (used by handleSyn)
  const connectedClients = new Map<string, MessageEventSource>();

  // UI state for storage access flow
  let needsStorageAccess = $state(false);
  let storageAccessError = $state<string | null>(null);
  let isRequestingAccess = $state(false);
  let handlersInitialized = false;

  function sendResponse(
    source: MessageEventSource | null,
    origin: string,
    response: ResponseMessage
  ): void {
    if (!source) return;
    source.postMessage(response, { targetOrigin: origin } as WindowPostMessageOptions);
  }

  function sendError(
    source: MessageEventSource | null,
    origin: string,
    id: string,
    code: string,
    message: string
  ): void {
    sendResponse(source, origin, { type: 'ERROR', id, code, message });
  }

  async function handleSyn(
    source: MessageEventSource,
    origin: string,
    msg: Extract<RequestMessage, { type: 'SYN' }>
  ): Promise<void> {
    // Check if gateway is configured
    if (!isGatewayConfigured()) {
      sendError(
        source,
        origin,
        msg.id,
        'GATEWAY_NOT_CONFIGURED',
        'Gateway not configured. Visit the Federise management page to configure your gateway connection.'
      );
      return;
    }

    try {
      // getPermissions always returns a valid record (with empty capabilities if none granted)
      const permissions = await getPermissions(origin);
      connectedClients.set(origin, source);

      sendResponse(source, origin, {
        type: 'ACK',
        id: msg.id,
        version: PROTOCOL_VERSION,
        capabilities: permissions.capabilities, // Always an array, never undefined
      });
    } catch (err) {
      console.error('[FrameEnforcer] Error in handleSyn:', err);
      sendError(
        source,
        origin,
        msg.id,
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to initialize connection'
      );
    }
  }

  async function handleRequestCapabilities(
    source: MessageEventSource,
    origin: string,
    msg: Extract<RequestMessage, { type: 'REQUEST_CAPABILITIES' }>
  ): Promise<void> {
    const permissions = await getPermissions(origin);
    const granted = permissions.capabilities; // Always an array
    const requested = msg.capabilities;

    const alreadyGranted = requested.filter((c) => granted.includes(c));
    const needsApproval = requested.filter((c) => !granted.includes(c));

    // Early return if all capabilities already granted
    if (needsApproval.length === 0) {
      sendResponse(source, origin, {
        type: 'CAPABILITIES_GRANTED',
        id: msg.id,
        granted: alreadyGranted,
      });
      return;
    }

    // Need user approval for some capabilities
    const scope = needsApproval.join(',');
    const authUrl = `/authorize?app_origin=${encodeURIComponent(origin)}&scope=${encodeURIComponent(scope)}`;

    sendResponse(source, origin, {
      type: 'AUTH_REQUIRED',
      id: msg.id,
      url: new URL(authUrl, window.location.origin).href,
      granted: alreadyGranted,
    });
  }

  async function handleKVGet(
    source: MessageEventSource,
    origin: string,
    msg: Extract<RequestMessage, { type: 'KV_GET' }>
  ): Promise<void> {
    if (!(await hasCapability(origin, 'kv:read'))) {
      sendResponse(source, origin, {
        type: 'PERMISSION_DENIED',
        id: msg.id,
        capability: 'kv:read',
      });
      return;
    }

    const value = await getKV(origin, msg.key);
    sendResponse(source, origin, {
      type: 'KV_RESULT',
      id: msg.id,
      value,
    });
  }

  async function handleKVSet(
    source: MessageEventSource,
    origin: string,
    msg: Extract<RequestMessage, { type: 'KV_SET' }>
  ): Promise<void> {
    if (!(await hasCapability(origin, 'kv:write'))) {
      sendResponse(source, origin, {
        type: 'PERMISSION_DENIED',
        id: msg.id,
        capability: 'kv:write',
      });
      return;
    }

    await setKV(origin, msg.key, msg.value);
    sendResponse(source, origin, {
      type: 'KV_OK',
      id: msg.id,
    });
  }

  async function handleKVDelete(
    source: MessageEventSource,
    origin: string,
    msg: Extract<RequestMessage, { type: 'KV_DELETE' }>
  ): Promise<void> {
    if (!(await hasCapability(origin, 'kv:delete'))) {
      sendResponse(source, origin, {
        type: 'PERMISSION_DENIED',
        id: msg.id,
        capability: 'kv:delete',
      });
      return;
    }

    await deleteKV(origin, msg.key);
    sendResponse(source, origin, {
      type: 'KV_OK',
      id: msg.id,
    });
  }

  async function handleKVKeys(
    source: MessageEventSource,
    origin: string,
    msg: Extract<RequestMessage, { type: 'KV_KEYS' }>
  ): Promise<void> {
    if (!(await hasCapability(origin, 'kv:read'))) {
      sendResponse(source, origin, {
        type: 'PERMISSION_DENIED',
        id: msg.id,
        capability: 'kv:read',
      });
      return;
    }

    const keys = await listKVKeys(origin, msg.prefix);
    sendResponse(source, origin, {
      type: 'KV_KEYS_RESULT',
      id: msg.id,
      keys,
    });
  }

  async function handleBlobUpload(
    source: MessageEventSource,
    origin: string,
    msg: Extract<RequestMessage, { type: 'BLOB_UPLOAD' }>
  ): Promise<void> {
    if (!(await hasCapability(origin, 'blob:write'))) {
      sendResponse(source, origin, {
        type: 'PERMISSION_DENIED',
        id: msg.id,
        capability: 'blob:write',
      });
      return;
    }

    try {
      // Data is already an ArrayBuffer (transferred from SDK)
      // Support both visibility and legacy isPublic
      const metadata = await uploadBlob(origin, msg.key, msg.contentType, msg.data, msg.visibility, msg.isPublic);
      sendResponse(source, origin, {
        type: 'BLOB_UPLOADED',
        id: msg.id,
        metadata,
      });
    } catch (err) {
      sendError(source, origin, msg.id, 'UPLOAD_FAILED', err instanceof Error ? err.message : 'Upload failed');
    }
  }

  async function handleBlobGet(
    source: MessageEventSource,
    origin: string,
    msg: Extract<RequestMessage, { type: 'BLOB_GET' }>
  ): Promise<void> {
    if (!(await hasCapability(origin, 'blob:read'))) {
      sendResponse(source, origin, {
        type: 'PERMISSION_DENIED',
        id: msg.id,
        capability: 'blob:read',
      });
      return;
    }

    try {
      const result = await getBlob(origin, msg.key);
      sendResponse(source, origin, {
        type: 'BLOB_DOWNLOAD_URL',
        id: msg.id,
        url: result.url,
        metadata: result.metadata,
      });
    } catch (err) {
      sendError(source, origin, msg.id, 'NOT_FOUND', 'Blob not found');
    }
  }

  async function handleBlobDelete(
    source: MessageEventSource,
    origin: string,
    msg: Extract<RequestMessage, { type: 'BLOB_DELETE' }>
  ): Promise<void> {
    if (!(await hasCapability(origin, 'blob:write'))) {
      sendResponse(source, origin, {
        type: 'PERMISSION_DENIED',
        id: msg.id,
        capability: 'blob:write',
      });
      return;
    }

    await deleteBlob(origin, msg.key);
    sendResponse(source, origin, {
      type: 'BLOB_OK',
      id: msg.id,
    });
  }

  async function handleBlobList(
    source: MessageEventSource,
    origin: string,
    msg: Extract<RequestMessage, { type: 'BLOB_LIST' }>
  ): Promise<void> {
    if (!(await hasCapability(origin, 'blob:read'))) {
      sendResponse(source, origin, {
        type: 'PERMISSION_DENIED',
        id: msg.id,
        capability: 'blob:read',
      });
      return;
    }

    const blobs = await listBlobs(origin);
    sendResponse(source, origin, {
      type: 'BLOB_LIST_RESULT',
      id: msg.id,
      blobs,
    });
  }

  async function handleBlobGetUploadUrl(
    source: MessageEventSource,
    origin: string,
    msg: Extract<RequestMessage, { type: 'BLOB_GET_UPLOAD_URL' }>
  ): Promise<void> {
    if (!(await hasCapability(origin, 'blob:write'))) {
      sendResponse(source, origin, {
        type: 'PERMISSION_DENIED',
        id: msg.id,
        capability: 'blob:write',
      });
      return;
    }

    try {
      // Support both visibility and legacy isPublic
      const result = await getUploadUrlWithMetadata(origin, msg.key, msg.contentType, msg.size, msg.visibility, msg.isPublic);

      if (!result) {
        // Presigned URLs not available - SDK should fall back to BLOB_UPLOAD
        sendError(source, origin, msg.id, 'PRESIGN_NOT_AVAILABLE', 'Presigned uploads not configured');
        return;
      }

      sendResponse(source, origin, {
        type: 'BLOB_UPLOAD_URL',
        id: msg.id,
        uploadUrl: result.uploadUrl,
        metadata: result.metadata,
      });
    } catch (err) {
      sendError(source, origin, msg.id, 'PRESIGN_FAILED', err instanceof Error ? err.message : 'Failed to get upload URL');
    }
  }

  async function handleBlobSetVisibility(
    source: MessageEventSource,
    origin: string,
    msg: Extract<RequestMessage, { type: 'BLOB_SET_VISIBILITY' }>
  ): Promise<void> {
    if (!(await hasCapability(origin, 'blob:write'))) {
      sendResponse(source, origin, {
        type: 'PERMISSION_DENIED',
        id: msg.id,
        capability: 'blob:write',
      });
      return;
    }

    try {
      const metadata = await setBlobVisibility(origin, msg.key, msg.visibility);
      sendResponse(source, origin, {
        type: 'BLOB_VISIBILITY_SET',
        id: msg.id,
        metadata,
      });
    } catch (err) {
      sendError(source, origin, msg.id, 'VISIBILITY_FAILED', err instanceof Error ? err.message : 'Failed to set visibility');
    }
  }

  async function handleLogCreate(
    source: MessageEventSource,
    origin: string,
    msg: Extract<RequestMessage, { type: 'LOG_CREATE' }>
  ): Promise<void> {
    if (!(await hasCapability(origin, 'log:create'))) {
      sendResponse(source, origin, {
        type: 'PERMISSION_DENIED',
        id: msg.id,
        capability: 'log:create',
      });
      return;
    }

    try {
      const result = await createLog(origin, msg.name);
      sendResponse(source, origin, {
        type: 'LOG_CREATED',
        id: msg.id,
        metadata: result.metadata,
        secret: result.secret,
      });
    } catch (err) {
      sendError(source, origin, msg.id, 'LOG_CREATE_FAILED', err instanceof Error ? err.message : 'Failed to create log');
    }
  }

  async function handleLogList(
    source: MessageEventSource,
    origin: string,
    msg: Extract<RequestMessage, { type: 'LOG_LIST' }>
  ): Promise<void> {
    if (!(await hasCapability(origin, 'log:create'))) {
      sendResponse(source, origin, {
        type: 'PERMISSION_DENIED',
        id: msg.id,
        capability: 'log:create',
      });
      return;
    }

    try {
      const logs = await listLogs(origin);
      sendResponse(source, origin, {
        type: 'LOG_LIST_RESULT',
        id: msg.id,
        logs,
      });
    } catch (err) {
      sendError(source, origin, msg.id, 'LOG_LIST_FAILED', err instanceof Error ? err.message : 'Failed to list logs');
    }
  }

  async function handleLogAppend(
    source: MessageEventSource,
    origin: string,
    msg: Extract<RequestMessage, { type: 'LOG_APPEND' }>
  ): Promise<void> {
    if (!(await hasCapability(origin, 'log:create'))) {
      sendResponse(source, origin, {
        type: 'PERMISSION_DENIED',
        id: msg.id,
        capability: 'log:create',
      });
      return;
    }

    try {
      const event = await appendLog(origin, msg.logId, msg.content);
      sendResponse(source, origin, {
        type: 'LOG_APPENDED',
        id: msg.id,
        event,
      });
    } catch (err) {
      sendError(source, origin, msg.id, 'LOG_APPEND_FAILED', err instanceof Error ? err.message : 'Failed to append to log');
    }
  }

  async function handleLogRead(
    source: MessageEventSource,
    origin: string,
    msg: Extract<RequestMessage, { type: 'LOG_READ' }>
  ): Promise<void> {
    if (!(await hasCapability(origin, 'log:create'))) {
      sendResponse(source, origin, {
        type: 'PERMISSION_DENIED',
        id: msg.id,
        capability: 'log:create',
      });
      return;
    }

    try {
      const result = await readLog(origin, msg.logId, msg.afterSeq, msg.limit);
      sendResponse(source, origin, {
        type: 'LOG_READ_RESULT',
        id: msg.id,
        events: result.events,
        hasMore: result.hasMore,
      });
    } catch (err) {
      sendError(source, origin, msg.id, 'LOG_READ_FAILED', err instanceof Error ? err.message : 'Failed to read log');
    }
  }

  async function handleLogDelete(
    source: MessageEventSource,
    origin: string,
    msg: Extract<RequestMessage, { type: 'LOG_DELETE' }>
  ): Promise<void> {
    if (!(await hasCapability(origin, 'log:delete'))) {
      sendResponse(source, origin, {
        type: 'PERMISSION_DENIED',
        id: msg.id,
        capability: 'log:delete',
      });
      return;
    }

    try {
      await deleteLog(origin, msg.logId);
      sendResponse(source, origin, {
        type: 'LOG_DELETED',
        id: msg.id,
      });
    } catch (err) {
      sendError(source, origin, msg.id, 'LOG_DELETE_FAILED', err instanceof Error ? err.message : 'Failed to delete log');
    }
  }

  async function handleLogTokenCreate(
    source: MessageEventSource,
    origin: string,
    msg: Extract<RequestMessage, { type: 'LOG_TOKEN_CREATE' }>
  ): Promise<void> {
    if (!(await hasCapability(origin, 'log:create'))) {
      sendResponse(source, origin, {
        type: 'PERMISSION_DENIED',
        id: msg.id,
        capability: 'log:create',
      });
      return;
    }

    try {
      const result = await createLogToken(origin, msg.logId, msg.permissions, msg.expiresInSeconds);
      await requestStorageAccess();
      const { url: gatewayUrl } = getGatewayConfig();
      sendResponse(source, origin, {
        type: 'LOG_TOKEN_CREATED',
        id: msg.id,
        token: result.token,
        expiresAt: result.expiresAt,
        gatewayUrl: gatewayUrl || '',
      });
    } catch (err) {
      sendError(source, origin, msg.id, 'LOG_TOKEN_CREATE_FAILED', err instanceof Error ? err.message : 'Failed to create token');
    }
  }

  async function handleTestGrantPermissions(
    source: MessageEventSource,
    origin: string,
    msg: Extract<RequestMessage, { type: 'TEST_GRANT_PERMISSIONS' }>
  ): Promise<void> {
    // Only allow test harness origin (localhost:5174) in development
    if (import.meta.env.DEV && origin === 'http://localhost:5174') {
      await grantCapabilities(origin, msg.capabilities);
      sendResponse(source, origin, {
        type: 'TEST_PERMISSIONS_GRANTED',
        id: msg.id,
      });
    } else {
      sendError(source, origin, msg.id, 'FORBIDDEN', 'Test messages only allowed from test harness');
    }
  }

  async function handleTestClearPermissions(
    source: MessageEventSource,
    origin: string,
    msg: Extract<RequestMessage, { type: 'TEST_CLEAR_PERMISSIONS' }>
  ): Promise<void> {
    // Only allow test harness origin (localhost:5174) in development
    if (import.meta.env.DEV && origin === 'http://localhost:5174') {
      await revokePermissions(origin);
      sendResponse(source, origin, {
        type: 'TEST_PERMISSIONS_CLEARED',
        id: msg.id,
      });
    } else {
      sendError(source, origin, msg.id, 'FORBIDDEN', 'Test messages only allowed from test harness');
    }
  }

  async function handleMessage(event: MessageEvent): Promise<void> {
    // Ignore messages from self
    if (event.origin === window.location.origin) return;

    // Validate message structure
    if (!isValidRequest(event.data)) {
      if (event.data?.id) {
        sendError(event.source, event.origin, event.data.id, 'INVALID_MESSAGE', 'Invalid message format');
      }
      return;
    }

    const message = event.data as RequestMessage;
    const origin = event.origin;
    const source = event.source as MessageEventSource;

    switch (message.type) {
      case 'SYN':
        await handleSyn(source, origin, message);
        break;
      case 'REQUEST_CAPABILITIES':
        await handleRequestCapabilities(source, origin, message);
        break;
      case 'KV_GET':
        await handleKVGet(source, origin, message);
        break;
      case 'KV_SET':
        await handleKVSet(source, origin, message);
        break;
      case 'KV_DELETE':
        await handleKVDelete(source, origin, message);
        break;
      case 'KV_KEYS':
        await handleKVKeys(source, origin, message);
        break;
      case 'BLOB_UPLOAD':
        await handleBlobUpload(source, origin, message);
        break;
      case 'BLOB_GET':
        await handleBlobGet(source, origin, message);
        break;
      case 'BLOB_DELETE':
        await handleBlobDelete(source, origin, message);
        break;
      case 'BLOB_LIST':
        await handleBlobList(source, origin, message);
        break;
      case 'BLOB_GET_UPLOAD_URL':
        await handleBlobGetUploadUrl(source, origin, message);
        break;
      case 'BLOB_SET_VISIBILITY':
        await handleBlobSetVisibility(source, origin, message);
        break;
      case 'LOG_CREATE':
        await handleLogCreate(source, origin, message);
        break;
      case 'LOG_LIST':
        await handleLogList(source, origin, message);
        break;
      case 'LOG_APPEND':
        await handleLogAppend(source, origin, message);
        break;
      case 'LOG_READ':
        await handleLogRead(source, origin, message);
        break;
      case 'LOG_DELETE':
        await handleLogDelete(source, origin, message);
        break;
      case 'LOG_TOKEN_CREATE':
        await handleLogTokenCreate(source, origin, message);
        break;
      case 'TEST_GRANT_PERMISSIONS':
        await handleTestGrantPermissions(source, origin, message);
        break;
      case 'TEST_CLEAR_PERMISSIONS':
        await handleTestClearPermissions(source, origin, message);
        break;
    }
  }

  async function handleConnectClick(): Promise<void> {
    isRequestingAccess = true;
    storageAccessError = null;

    try {
      const success = await requestStorageAccess();

      if (!success) {
        storageAccessError = 'Storage access was denied. Please try again.';
        return;
      }

      if (!isGatewayConfigured()) {
        storageAccessError = 'Storage access granted, but Federise is not configured. Please visit federise.org to set up your account first.';
        return;
      }

      // Success - hide UI and signal parent
      needsStorageAccess = false;
      window.parent.postMessage({ type: '__STORAGE_ACCESS_GRANTED__' }, '*');
    } catch (err) {
      storageAccessError = err instanceof Error ? err.message : 'Failed to request storage access';
    } finally {
      isRequestingAccess = false;
    }
  }

  onMount(async () => {
    const isIframe = window.self !== window.top;

    if (!isIframe) {
      // Top-level context - just set up handlers
      setupMessageHandlers();
      return;
    }

    // In iframe context, check storage access (sets internal state for production cross-origin cases)
    await checkStorageAccess();

    // Check if gateway is configured (tries cookies first, works on localhost)
    // This handles the localhost case where Storage Access might report false
    // but cookies are actually accessible because localhost ports are same-site
    if (isGatewayConfigured()) {
      // Gateway is configured - ready to go
      setupMessageHandlers();
      return;
    }

    // Gateway not configured - could be:
    // 1. User hasn't set up gateway yet (needs to visit org app directly)
    // 2. Cross-origin production case where we need Storage Access for cookies
    // Show modal to either grant storage access or inform user
    needsStorageAccess = true;
    window.parent.postMessage({ type: '__STORAGE_ACCESS_REQUIRED__' }, '*');
  });

  function setupMessageHandlers(): void {
    if (handlersInitialized) return;
    handlersInitialized = true;

    window.addEventListener('message', handleMessage);

    // Signal to parent that frame is ready
    if (window.parent !== window) {
      window.parent.postMessage({ type: '__FRAME_READY__' }, '*');
    }
  }

  // Called after successful storage access
  $effect(() => {
    if (!needsStorageAccess && window.self !== window.top) {
      // Storage access was granted, set up handlers
      setupMessageHandlers();
    }
  });

  onDestroy(() => {
    window.removeEventListener('message', handleMessage);
  });
</script>

{#if needsStorageAccess}
  <div class="connect-container">
    <div class="connect-card">
      <svg class="logo" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="14" stroke="currentColor" stroke-width="2"/>
        <path d="M10 16h12M16 10v12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <h2>Connect with Federise</h2>
      <p>This app uses Federise for secure data storage. Click below to connect your Federise account.</p>

      {#if storageAccessError}
        <div class="error">{storageAccessError}</div>
      {/if}

      <button
        class="connect-button"
        onclick={handleConnectClick}
        disabled={isRequestingAccess}
      >
        {#if isRequestingAccess}
          Connecting...
        {:else}
          Connect with Federise
        {/if}
      </button>

      <p class="hint">
        Don't have an account? <a href="https://federise.org" target="_blank">Set up Federise</a>
      </p>
    </div>
  </div>
{/if}

<style>
  .connect-container {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 1rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .connect-card {
    background: white;
    border-radius: 16px;
    padding: 2rem;
    max-width: 360px;
    text-align: center;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  }

  .logo {
    width: 48px;
    height: 48px;
    color: #667eea;
    margin-bottom: 1rem;
  }

  h2 {
    margin: 0 0 0.5rem;
    font-size: 1.5rem;
    color: #1a1a2e;
  }

  p {
    margin: 0 0 1.5rem;
    color: #666;
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .error {
    background: #fee2e2;
    border: 1px solid #fecaca;
    color: #dc2626;
    padding: 0.75rem;
    border-radius: 8px;
    margin-bottom: 1rem;
    font-size: 0.85rem;
  }

  .connect-button {
    width: 100%;
    padding: 0.875rem 1.5rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .connect-button:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  .connect-button:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .hint {
    margin-top: 1.5rem;
    margin-bottom: 0;
    font-size: 0.8rem;
    color: #888;
  }

  .hint a {
    color: #667eea;
    text-decoration: none;
  }

  .hint a:hover {
    text-decoration: underline;
  }

  /* Mobile styles */
  @media (max-width: 480px) {
    .connect-container {
      padding: 0.75rem;
      align-items: flex-start;
      padding-top: 10vh;
    }

    .connect-card {
      padding: 1.5rem;
      border-radius: 12px;
      max-width: 100%;
    }

    .logo {
      width: 40px;
      height: 40px;
    }

    h2 {
      font-size: 1.25rem;
    }

    p {
      font-size: 0.85rem;
      margin-bottom: 1.25rem;
    }

    .connect-button {
      padding: 0.75rem 1.25rem;
      font-size: 0.95rem;
    }

    .hint {
      margin-top: 1.25rem;
      font-size: 0.75rem;
    }
  }
</style>

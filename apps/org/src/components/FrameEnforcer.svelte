<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    type RequestMessage,
    type ResponseMessage,
    type Capability,
    type PermissionUpdateMessage,
    PROTOCOL_VERSION,
    isValidRequest,
  } from '../lib/protocol';
  import { getPermissions, hasCapability, grantCapabilities, revokePermissions } from '../lib/permissions';
  import { getKV, setKV, deleteKV, listKVKeys } from '../lib/kv-storage';

  let broadcastChannel: BroadcastChannel | null = null;

  // Track connected clients by origin for permission update notifications
  const connectedClients = new Map<string, MessageEventSource>();

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

  function handleSyn(
    source: MessageEventSource,
    origin: string,
    msg: Extract<RequestMessage, { type: 'SYN' }>
  ): void {
    const permissions = getPermissions(origin);
    connectedClients.set(origin, source);

    sendResponse(source, origin, {
      type: 'ACK',
      id: msg.id,
      version: PROTOCOL_VERSION,
      capabilities: permissions?.capabilities,
    });
  }

  function handleRequestCapabilities(
    source: MessageEventSource,
    origin: string,
    msg: Extract<RequestMessage, { type: 'REQUEST_CAPABILITIES' }>
  ): void {
    const permissions = getPermissions(origin);
    const granted = permissions?.capabilities ?? [];
    const requested = msg.capabilities;

    const alreadyGranted = requested.filter((c) => granted.includes(c));
    const needsApproval = requested.filter((c) => !granted.includes(c));

    if (needsApproval.length === 0) {
      sendResponse(source, origin, {
        type: 'CAPABILITIES_GRANTED',
        id: msg.id,
        granted: alreadyGranted,
      });
    } else {
      const scope = needsApproval.join(',');
      const authUrl = `/authorize?app_origin=${encodeURIComponent(origin)}&scope=${encodeURIComponent(scope)}`;

      sendResponse(source, origin, {
        type: 'AUTH_REQUIRED',
        id: msg.id,
        url: new URL(authUrl, window.location.origin).href,
        granted: alreadyGranted,
      });
    }
  }

  function handleKVGet(
    source: MessageEventSource,
    origin: string,
    msg: Extract<RequestMessage, { type: 'KV_GET' }>
  ): void {
    if (!hasCapability(origin, 'kv:read')) {
      sendResponse(source, origin, {
        type: 'PERMISSION_DENIED',
        id: msg.id,
        capability: 'kv:read',
      });
      return;
    }

    const value = getKV(origin, msg.key);
    sendResponse(source, origin, {
      type: 'KV_RESULT',
      id: msg.id,
      value,
    });
  }

  function handleKVSet(
    source: MessageEventSource,
    origin: string,
    msg: Extract<RequestMessage, { type: 'KV_SET' }>
  ): void {
    if (!hasCapability(origin, 'kv:write')) {
      sendResponse(source, origin, {
        type: 'PERMISSION_DENIED',
        id: msg.id,
        capability: 'kv:write',
      });
      return;
    }

    setKV(origin, msg.key, msg.value);
    sendResponse(source, origin, {
      type: 'KV_OK',
      id: msg.id,
    });
  }

  function handleKVDelete(
    source: MessageEventSource,
    origin: string,
    msg: Extract<RequestMessage, { type: 'KV_DELETE' }>
  ): void {
    if (!hasCapability(origin, 'kv:delete')) {
      sendResponse(source, origin, {
        type: 'PERMISSION_DENIED',
        id: msg.id,
        capability: 'kv:delete',
      });
      return;
    }

    deleteKV(origin, msg.key);
    sendResponse(source, origin, {
      type: 'KV_OK',
      id: msg.id,
    });
  }

  function handleKVKeys(
    source: MessageEventSource,
    origin: string,
    msg: Extract<RequestMessage, { type: 'KV_KEYS' }>
  ): void {
    if (!hasCapability(origin, 'kv:read')) {
      sendResponse(source, origin, {
        type: 'PERMISSION_DENIED',
        id: msg.id,
        capability: 'kv:read',
      });
      return;
    }

    const keys = listKVKeys(origin, msg.prefix);
    sendResponse(source, origin, {
      type: 'KV_KEYS_RESULT',
      id: msg.id,
      keys,
    });
  }

  function handleTestGrantPermissions(
    source: MessageEventSource,
    origin: string,
    msg: Extract<RequestMessage, { type: 'TEST_GRANT_PERMISSIONS' }>
  ): void {
    // Only allow test harness origin (localhost:5174) in development
    if (import.meta.env.DEV && origin === 'http://localhost:5174') {
      grantCapabilities(origin, msg.capabilities);
      sendResponse(source, origin, {
        type: 'TEST_PERMISSIONS_GRANTED',
        id: msg.id,
      });
    } else {
      sendError(source, origin, msg.id, 'FORBIDDEN', 'Test messages only allowed from test harness');
    }
  }

  function handleTestClearPermissions(
    source: MessageEventSource,
    origin: string,
    msg: Extract<RequestMessage, { type: 'TEST_CLEAR_PERMISSIONS' }>
  ): void {
    // Only allow test harness origin (localhost:5174) in development
    if (import.meta.env.DEV && origin === 'http://localhost:5174') {
      revokePermissions(origin);
      sendResponse(source, origin, {
        type: 'TEST_PERMISSIONS_CLEARED',
        id: msg.id,
      });
    } else {
      sendError(source, origin, msg.id, 'FORBIDDEN', 'Test messages only allowed from test harness');
    }
  }

  function handleMessage(event: MessageEvent): void {
    console.log('[FrameEnforcer] Received message:', event.data, 'from origin:', event.origin);

    // Ignore messages from self
    if (event.origin === window.location.origin) {
      console.log('[FrameEnforcer] Ignoring message from same origin');
      return;
    }

    // Validate message structure
    if (!isValidRequest(event.data)) {
      console.log('[FrameEnforcer] Invalid message format');
      if (event.data?.id) {
        sendError(event.source, event.origin, event.data.id, 'INVALID_MESSAGE', 'Invalid message format');
      }
      return;
    }

    console.log('[FrameEnforcer] Processing valid message:', event.data.type);

    const message = event.data as RequestMessage;
    const origin = event.origin;
    const source = event.source as MessageEventSource;

    switch (message.type) {
      case 'SYN':
        handleSyn(source, origin, message);
        break;
      case 'REQUEST_CAPABILITIES':
        handleRequestCapabilities(source, origin, message);
        break;
      case 'KV_GET':
        handleKVGet(source, origin, message);
        break;
      case 'KV_SET':
        handleKVSet(source, origin, message);
        break;
      case 'KV_DELETE':
        handleKVDelete(source, origin, message);
        break;
      case 'KV_KEYS':
        handleKVKeys(source, origin, message);
        break;
      case 'TEST_GRANT_PERMISSIONS':
        handleTestGrantPermissions(source, origin, message);
        break;
      case 'TEST_CLEAR_PERMISSIONS':
        handleTestClearPermissions(source, origin, message);
        break;
    }
  }

  function handlePermissionUpdate(event: MessageEvent<PermissionUpdateMessage>): void {
    if (event.data.type !== 'PERMISSIONS_UPDATED') return;

    const origin = event.data.origin;
    const source = connectedClients.get(origin);
    const permissions = getPermissions(origin);

    if (source && permissions) {
      // Notify the client that permissions were updated
      sendResponse(source, origin, {
        type: 'CAPABILITIES_GRANTED',
        id: 'permission-update',
        granted: permissions.capabilities,
      });
    }
  }

  onMount(() => {
    console.log('[FrameEnforcer] Component mounted, setting up message listeners');
    console.log('[FrameEnforcer] Window origin:', window.location.origin);

    window.addEventListener('message', handleMessage);

    // Listen for permission updates from /authorize popup
    broadcastChannel = new BroadcastChannel('federise:permissions');
    broadcastChannel.onmessage = handlePermissionUpdate;

    console.log('[FrameEnforcer] Ready to receive messages');

    // Signal to parent that frame is ready to receive messages
    // This is sent AFTER the message listener is set up
    if (window.parent !== window) {
      console.log('[FrameEnforcer] Sending ready signal to parent');
      window.parent.postMessage({ type: '__FRAME_READY__' }, '*');
    }
  });

  onDestroy(() => {
    window.removeEventListener('message', handleMessage);
    broadcastChannel?.close();
  });
</script>

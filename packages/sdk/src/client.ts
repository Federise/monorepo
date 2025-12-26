import type {
  Capability,
  FederiseClientOptions,
  GrantResult,
  RequestPayload,
  ResponseMessage,
} from './types';
import {
  PROTOCOL_VERSION,
  FederiseError,
  PermissionDeniedError,
  TimeoutError,
  ConnectionError,
} from './types';

interface PendingRequest {
  resolve: (value: ResponseMessage) => void;
  reject: (err: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

const DEFAULT_FRAME_URL = 'https://federise.org/frame';
const DEFAULT_TIMEOUT = 30000;

function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export class FederiseClient {
  private iframe: HTMLIFrameElement | null = null;
  private connected = false;
  private connecting = false;
  private pendingRequests = new Map<string, PendingRequest>();
  private grantedCapabilities: Capability[] = [];
  private frameUrl: string;
  private timeout: number;
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private permissionWaiters: Array<{
    capabilities: Capability[];
    resolve: () => void;
  }> = [];

  constructor(options?: FederiseClientOptions) {
    this.frameUrl = options?.frameUrl ?? DEFAULT_FRAME_URL;
    this.timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    if (this.connecting) {
      throw new ConnectionError('Connection already in progress');
    }

    this.connecting = true;

    try {
      // Create invisible iframe
      this.iframe = document.createElement('iframe');
      this.iframe.src = this.frameUrl;
      this.iframe.style.display = 'none';
      this.iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      document.body.appendChild(this.iframe);

      // Wait for iframe to load
      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new ConnectionError('Frame load timeout'));
        }, this.timeout);

        this.iframe!.onload = () => {
          clearTimeout(timeoutId);
          resolve();
        };
        this.iframe!.onerror = () => {
          clearTimeout(timeoutId);
          reject(new ConnectionError('Failed to load frame'));
        };
      });

      // Setup message listener BEFORE waiting for ready signal
      this.messageHandler = this.handleMessage.bind(this);
      window.addEventListener('message', this.messageHandler);

      // Wait for frame to signal it's ready (handles client:only components)
      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new ConnectionError('Frame ready timeout - component may not have initialized'));
        }, this.timeout);

        const readyHandler = (event: MessageEvent) => {
          if (event.source === this.iframe?.contentWindow &&
              event.data?.type === '__FRAME_READY__') {
            clearTimeout(timeoutId);
            window.removeEventListener('message', readyHandler);
            resolve();
          }
        };

        window.addEventListener('message', readyHandler);
      });

      // Perform handshake
      const response = await this.sendRequest({
        type: 'SYN',
        version: PROTOCOL_VERSION,
      });

      if (response.type === 'ACK') {
        this.connected = true;
        this.grantedCapabilities = response.capabilities ?? [];
      } else if (response.type === 'ERROR') {
        throw new FederiseError(response.message, response.code);
      } else {
        throw new ConnectionError('Unexpected handshake response');
      }
    } finally {
      this.connecting = false;
    }
  }

  disconnect(): void {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }

    if (this.iframe) {
      this.iframe.remove();
      this.iframe = null;
    }

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new ConnectionError('Client disconnected'));
    }
    this.pendingRequests.clear();

    this.connected = false;
    this.grantedCapabilities = [];
  }

  isConnected(): boolean {
    return this.connected;
  }

  getGrantedCapabilities(): Capability[] {
    return [...this.grantedCapabilities];
  }

  async requestCapabilities(capabilities: Capability[]): Promise<GrantResult> {
    this.ensureConnected();

    const response = await this.sendRequest({
      type: 'REQUEST_CAPABILITIES',
      capabilities,
    });

    if (response.type === 'CAPABILITIES_GRANTED') {
      this.grantedCapabilities = response.granted;
      return {
        granted: true,
        capabilities: response.granted,
        pending: [],
      };
    }

    if (response.type === 'AUTH_REQUIRED') {
      // Open popup for user approval
      const popup = window.open(
        response.url,
        'federise-authorize',
        'width=450,height=600,popup=yes'
      );

      if (!popup) {
        throw new FederiseError(
          'Popup blocked. Please allow popups for this site.',
          'POPUP_BLOCKED'
        );
      }

      // Wait for permission update
      const neededCaps = capabilities.filter(
        (c) => !response.granted?.includes(c)
      );
      await this.waitForPermissionUpdate(neededCaps);

      // Re-request to get updated capabilities
      return this.requestCapabilities(capabilities);
    }

    if (response.type === 'ERROR') {
      throw new FederiseError(response.message, response.code);
    }

    throw new FederiseError('Unexpected response', 'UNKNOWN');
  }

  // KV namespace
  kv = {
    get: async (key: string): Promise<string | null> => {
      this.ensureConnected();
      this.ensureCapability('kv:read');

      const response = await this.sendRequest({ type: 'KV_GET', key });

      if (response.type === 'KV_RESULT') {
        return response.value;
      }
      if (response.type === 'PERMISSION_DENIED') {
        throw new PermissionDeniedError(response.capability);
      }
      if (response.type === 'ERROR') {
        throw new FederiseError(response.message, response.code);
      }

      throw new FederiseError('Unexpected response', 'UNKNOWN');
    },

    set: async (key: string, value: string): Promise<void> => {
      this.ensureConnected();
      this.ensureCapability('kv:write');

      const response = await this.sendRequest({ type: 'KV_SET', key, value });

      if (response.type === 'KV_OK') {
        return;
      }
      if (response.type === 'PERMISSION_DENIED') {
        throw new PermissionDeniedError(response.capability);
      }
      if (response.type === 'ERROR') {
        throw new FederiseError(response.message, response.code);
      }

      throw new FederiseError('Unexpected response', 'UNKNOWN');
    },

    delete: async (key: string): Promise<void> => {
      this.ensureConnected();
      this.ensureCapability('kv:delete');

      const response = await this.sendRequest({ type: 'KV_DELETE', key });

      if (response.type === 'KV_OK') {
        return;
      }
      if (response.type === 'PERMISSION_DENIED') {
        throw new PermissionDeniedError(response.capability);
      }
      if (response.type === 'ERROR') {
        throw new FederiseError(response.message, response.code);
      }

      throw new FederiseError('Unexpected response', 'UNKNOWN');
    },

    keys: async (prefix?: string): Promise<string[]> => {
      this.ensureConnected();
      this.ensureCapability('kv:read');

      const response = await this.sendRequest({ type: 'KV_KEYS', prefix });

      if (response.type === 'KV_KEYS_RESULT') {
        return response.keys;
      }
      if (response.type === 'PERMISSION_DENIED') {
        throw new PermissionDeniedError(response.capability);
      }
      if (response.type === 'ERROR') {
        throw new FederiseError(response.message, response.code);
      }

      throw new FederiseError('Unexpected response', 'UNKNOWN');
    },
  };

  private handleMessage(event: MessageEvent): void {
    console.log('[SDK] Received message:', event.data, 'from:', event.origin);

    // Verify source is our iframe
    if (event.source !== this.iframe?.contentWindow) {
      console.log('[SDK] Ignoring message - not from our iframe');
      return;
    }

    const response = event.data as ResponseMessage;
    const id = response.id;
    console.log('[SDK] Processing message with id:', id, 'type:', response.type);

    // Check for permission update broadcasts
    if (id === 'permission-update' && response.type === 'CAPABILITIES_GRANTED') {
      this.grantedCapabilities = response.granted;

      // Resolve any waiting permission requests
      for (const waiter of this.permissionWaiters) {
        const hasAll = waiter.capabilities.every((c) =>
          response.granted.includes(c)
        );
        if (hasAll) {
          waiter.resolve();
        }
      }
      this.permissionWaiters = this.permissionWaiters.filter((w) => {
        const hasAll = w.capabilities.every((c) =>
          response.granted.includes(c)
        );
        return !hasAll;
      });
      return;
    }

    // Handle regular request responses
    const pending = this.pendingRequests.get(id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(id);
      pending.resolve(response);
    }
  }

  private async sendRequest(payload: RequestPayload): Promise<ResponseMessage> {
    const id = generateRequestId();
    const message = { ...payload, id };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        console.error('[SDK] Request timed out:', message);
        reject(new TimeoutError());
      }, this.timeout);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      const frameOrigin = new URL(this.frameUrl).origin;
      console.log('[SDK] Sending message:', message, 'to origin:', frameOrigin);
      this.iframe!.contentWindow!.postMessage(message, frameOrigin);
    });
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new ConnectionError('Client is not connected. Call connect() first.');
    }
  }

  private ensureCapability(capability: Capability): void {
    if (!this.grantedCapabilities.includes(capability)) {
      throw new PermissionDeniedError(capability);
    }
  }

  private waitForPermissionUpdate(capabilities: Capability[]): Promise<void> {
    return new Promise((resolve) => {
      this.permissionWaiters.push({ capabilities, resolve });
    });
  }

  // Test-only methods for permission manipulation
  // These only work in development environments
  async _testGrantPermissions(capabilities: Capability[]): Promise<void> {
    this.ensureConnected();

    const response = await this.sendRequest({
      type: 'TEST_GRANT_PERMISSIONS',
      capabilities,
    } as RequestPayload);

    if (response.type === 'TEST_PERMISSIONS_GRANTED') {
      this.grantedCapabilities = capabilities;
      return;
    }
    if (response.type === 'ERROR') {
      throw new FederiseError(response.message, response.code);
    }

    throw new FederiseError('Unexpected response', 'UNKNOWN');
  }

  async _testClearPermissions(): Promise<void> {
    this.ensureConnected();

    const response = await this.sendRequest({
      type: 'TEST_CLEAR_PERMISSIONS',
    } as RequestPayload);

    if (response.type === 'TEST_PERMISSIONS_CLEARED') {
      this.grantedCapabilities = [];
      return;
    }
    if (response.type === 'ERROR') {
      throw new FederiseError(response.message, response.code);
    }

    throw new FederiseError('Unexpected response', 'UNKNOWN');
  }
}

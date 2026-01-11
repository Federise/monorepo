import type {
  BlobMetadata,
  BlobVisibility,
  Capability,
  FederiseClientOptions,
  GrantResult,
  RequestPayload,
  ResponseMessage,
  UploadOptions,
  UploadProgress,
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
  private iframeContainer: HTMLDivElement | null = null;
  private connected = false;
  private connecting = false;
  private pendingRequests = new Map<string, PendingRequest>();
  private grantedCapabilities: Capability[] = [];
  private frameUrl: string;
  private timeout: number;
  private messageHandler: ((event: MessageEvent) => void) | null = null;

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
      // Create container for iframe (allows showing/hiding with overlay)
      this.iframeContainer = document.createElement('div');
      this.iframeContainer.id = 'federise-frame-container';
      this.iframeContainer.style.cssText = `
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 999999;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
      `;

      // Create iframe - starts hidden in container
      this.iframe = document.createElement('iframe');
      this.iframe.src = this.frameUrl;
      this.iframe.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: min(400px, calc(100vw - 2rem));
        height: min(500px, calc(100vh - 2rem));
        border: none;
        border-radius: 16px;
        box-shadow: 0 25px 80px rgba(0, 0, 0, 0.4);
      `;
      this.iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-storage-access-by-user-activation allow-popups');

      // Setup message listeners BEFORE adding iframe to DOM to avoid race conditions
      this.messageHandler = this.handleMessage.bind(this);
      window.addEventListener('message', this.messageHandler);

      // Create promise for frame ready/storage access flow
      const frameReadyPromise = new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new ConnectionError('Frame ready timeout - component may not have initialized'));
        }, this.timeout);

        const frameMessageHandler = (event: MessageEvent) => {
          if (this.iframe && event.source !== this.iframe.contentWindow) return;

          if (event.data?.type === '__FRAME_READY__') {
            clearTimeout(timeoutId);
            window.removeEventListener('message', frameMessageHandler);
            this.hideFrame();
            resolve();
          } else if (event.data?.type === '__STORAGE_ACCESS_REQUIRED__') {
            this.showFrame();
          }
          // __STORAGE_ACCESS_GRANTED__ - keep listening for FRAME_READY
        };

        window.addEventListener('message', frameMessageHandler);
      });

      // Now add iframe to DOM
      this.iframeContainer.appendChild(this.iframe);
      document.body.appendChild(this.iframeContainer);

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

      // Wait for frame ready signal
      await frameReadyPromise;

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

  private showFrame(): void {
    if (this.iframeContainer) {
      this.iframeContainer.style.display = 'block';
    }
  }

  private hideFrame(): void {
    if (this.iframeContainer) {
      this.iframeContainer.style.display = 'none';
    }
  }

  disconnect(): void {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }

    if (this.iframeContainer) {
      this.iframeContainer.remove();
      this.iframeContainer = null;
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

      // Wait for popup to close (user approved or denied)
      await this.waitForPopupClose(popup);

      // Re-request to get updated capabilities from KV
      // Small delay to ensure KV write has propagated
      await new Promise((resolve) => setTimeout(resolve, 500));
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

  // Blob namespace
  blob = {
    /**
     * Upload a file to storage.
     * Attempts direct upload to R2 with progress tracking when available,
     * falls back to iframe upload for compatibility.
     */
    upload: async (
      file: File,
      options?: UploadOptions
    ): Promise<{ metadata: BlobMetadata }> => {
      this.ensureConnected();
      this.ensureCapability('blob:write');

      const key = options?.key ?? file.name;
      // Support both visibility and legacy isPublic
      const visibility: BlobVisibility = options?.visibility ?? (options?.isPublic ? 'public' : 'private');
      const onProgress = options?.onProgress;
      const contentType = file.type || 'application/octet-stream';

      // Try to get presigned URL for direct upload first
      // This is the preferred path as it supports large files (>2GB) without memory issues
      try {
        const presignResponse = await this.sendRequest({
          type: 'BLOB_GET_UPLOAD_URL',
          key,
          contentType,
          size: file.size,
          visibility,
        });

        if (presignResponse.type === 'BLOB_UPLOAD_URL') {
          // Direct upload to R2 with progress - pass File directly to XHR
          // XHR can stream File objects without loading into memory, avoiding:
          // - Firefox's 2GB ArrayBuffer limit
          // - Stale File reference issues from long read operations
          await this.uploadFileWithXHR(file, presignResponse.uploadUrl, onProgress);
          return { metadata: presignResponse.metadata };
        }

        if (presignResponse.type === 'PERMISSION_DENIED') {
          throw new PermissionDeniedError(presignResponse.capability);
        }

        // Presign not available - fall through to iframe upload
      } catch (err) {
        // If it's a permission error, rethrow
        if (err instanceof PermissionDeniedError) {
          throw err;
        }
        // Otherwise fall through to iframe upload
        console.debug('[Federise] Presigned upload not available, using iframe upload');
      }

      // Fallback: Upload through iframe (requires reading file into memory)
      // This path has limitations for very large files (>2GB on Firefox)
      if (onProgress) {
        onProgress({ phase: 'reading', loaded: 0, total: file.size, percentage: 0 });
      }

      const fileData = await this.readFileInChunks(file, (bytesRead) => {
        if (onProgress) {
          onProgress({
            phase: 'reading',
            loaded: bytesRead,
            total: file.size,
            percentage: Math.round((bytesRead / file.size) * 100),
          });
        }
      });

      if (onProgress) {
        onProgress({ phase: 'uploading', loaded: 0, total: file.size, percentage: 0 });
      }

      const response = await this.sendRequest(
        {
          type: 'BLOB_UPLOAD',
          key,
          contentType,
          data: fileData,
          visibility,
        },
        [fileData]
      );

      if (response.type === 'BLOB_UPLOADED') {
        // Report completion
        if (onProgress) {
          onProgress({ phase: 'uploading', loaded: file.size, total: file.size, percentage: 100 });
        }
        return { metadata: response.metadata };
      }
      if (response.type === 'PERMISSION_DENIED') {
        throw new PermissionDeniedError(response.capability);
      }
      if (response.type === 'ERROR') {
        throw new FederiseError(response.message, response.code);
      }

      throw new FederiseError('Unexpected response', 'UNKNOWN');
    },

    /**
     * Get a download URL for a file.
     */
    get: async (key: string): Promise<{ url: string; metadata: BlobMetadata }> => {
      this.ensureConnected();
      this.ensureCapability('blob:read');

      const response = await this.sendRequest({ type: 'BLOB_GET', key });

      if (response.type === 'BLOB_DOWNLOAD_URL') {
        return { url: response.url, metadata: response.metadata };
      }
      if (response.type === 'PERMISSION_DENIED') {
        throw new PermissionDeniedError(response.capability);
      }
      if (response.type === 'ERROR') {
        throw new FederiseError(response.message, response.code);
      }

      throw new FederiseError('Unexpected response', 'UNKNOWN');
    },

    /**
     * Delete a file from storage.
     */
    delete: async (key: string): Promise<void> => {
      this.ensureConnected();
      this.ensureCapability('blob:write');

      const response = await this.sendRequest({ type: 'BLOB_DELETE', key });

      if (response.type === 'BLOB_OK') {
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

    /**
     * List all files in storage.
     */
    list: async (): Promise<BlobMetadata[]> => {
      this.ensureConnected();
      this.ensureCapability('blob:read');

      const response = await this.sendRequest({ type: 'BLOB_LIST' });

      if (response.type === 'BLOB_LIST_RESULT') {
        return response.blobs;
      }
      if (response.type === 'PERMISSION_DENIED') {
        throw new PermissionDeniedError(response.capability);
      }
      if (response.type === 'ERROR') {
        throw new FederiseError(response.message, response.code);
      }

      throw new FederiseError('Unexpected response', 'UNKNOWN');
    },

    /**
     * Change the visibility of an existing file.
     * @param key - The file key
     * @param visibility - The new visibility level ('public', 'presigned', or 'private')
     */
    setVisibility: async (key: string, visibility: BlobVisibility): Promise<BlobMetadata> => {
      this.ensureConnected();
      this.ensureCapability('blob:write');

      const response = await this.sendRequest({ type: 'BLOB_SET_VISIBILITY', key, visibility });

      if (response.type === 'BLOB_VISIBILITY_SET') {
        return response.metadata;
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
    // Verify source is our iframe
    if (event.source !== this.iframe?.contentWindow) {
      return;
    }

    const response = event.data as ResponseMessage;
    const id = response.id;

    // Handle regular request responses
    const pending = this.pendingRequests.get(id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(id);
      pending.resolve(response);
    }
  }

  private async sendRequest(
    payload: RequestPayload,
    transferables?: Transferable[]
  ): Promise<ResponseMessage> {
    const id = generateRequestId();
    const message = { ...payload, id };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new TimeoutError());
      }, this.timeout);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      const frameOrigin = new URL(this.frameUrl).origin;
      if (transferables && transferables.length > 0) {
        this.iframe!.contentWindow!.postMessage(message, frameOrigin, transferables);
      } else {
        this.iframe!.contentWindow!.postMessage(message, frameOrigin);
      }
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

  /**
   * Upload a File directly to a presigned URL using XHR for progress tracking.
   * XHR can handle File objects natively and will stream them without loading
   * the entire file into memory, avoiding browser ArrayBuffer size limits.
   */
  private uploadFileWithXHR(
    file: File,
    uploadUrl: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const totalSize = file.size;

      // Report initial upload progress synchronously before any async operations
      if (onProgress) {
        onProgress({ phase: 'uploading', loaded: 0, total: totalSize, percentage: 0 });
      }

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress({
            phase: 'uploading',
            loaded: event.loaded,
            total: event.total,
            percentage: Math.round((event.loaded / event.total) * 100),
          });
        }
      });

      xhr.upload.addEventListener('load', () => {
        // Upload body sent successfully - report 100% for upload phase
        if (onProgress) {
          onProgress({ phase: 'uploading', loaded: totalSize, total: totalSize, percentage: 100 });
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new FederiseError(`Upload failed with status ${xhr.status}`, 'UPLOAD_FAILED'));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new FederiseError('Upload failed due to network error', 'UPLOAD_FAILED'));
      });

      xhr.addEventListener('abort', () => {
        reject(new FederiseError('Upload was aborted', 'UPLOAD_ABORTED'));
      });

      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      // Send the File directly - XHR streams it without loading into memory
      xhr.send(file);
    });
  }

  /**
   * Read a file in chunks using File.slice() to avoid stale File reference issues.
   * This is the recommended approach for large files - each slice creates a fresh
   * reference that's read quickly before it can go stale.
   */
  private async readFileInChunks(
    file: File,
    onProgress?: (bytesRead: number) => void
  ): Promise<ArrayBuffer> {
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
    const chunks: Uint8Array[] = [];
    let bytesRead = 0;

    while (bytesRead < file.size) {
      const end = Math.min(bytesRead + CHUNK_SIZE, file.size);
      const slice = file.slice(bytesRead, end);

      try {
        const buffer = await slice.arrayBuffer();
        chunks.push(new Uint8Array(buffer));
      } catch (err) {
        throw new FederiseError(
          `Failed to read file at offset ${bytesRead}. The file may have been modified or moved.`,
          'FILE_READ_ERROR'
        );
      }

      bytesRead = end;

      if (onProgress) {
        onProgress(bytesRead);
      }
    }

    // Combine chunks into single ArrayBuffer
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result.buffer;
  }

  private waitForPopupClose(popup: Window): Promise<void> {
    return new Promise((resolve) => {
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          resolve();
        }
      }, 200);
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

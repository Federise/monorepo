/**
 * PostMessageTransport - Handles postMessage communication with SDK clients.
 *
 * This transport is used in the iframe context where the frame receives
 * messages from SDK clients via window.postMessage.
 */

import type { ResponseMessage } from '../types';
import type { MessageRouter } from '../router';

/**
 * Options for PostMessageTransport construction.
 */
export interface PostMessageTransportOptions {
  /** The message router to handle incoming messages */
  router: MessageRouter;
  /**
   * Called when storage access is required in iframe context.
   * The transport will not signal ready until storage access is granted.
   */
  onStorageAccessRequired?: () => void;
  /**
   * Called when the transport is ready to receive messages.
   */
  onReady?: () => void;
  /**
   * The window to listen for messages on (defaults to global window).
   */
  window?: Window;
}

/**
 * PostMessageTransport listens for postMessage events and routes them
 * through the MessageRouter.
 */
export class PostMessageTransport {
  private router: MessageRouter;
  private onStorageAccessRequired?: () => void;
  private onReady?: () => void;
  private win: Window;
  private messageHandler: (event: MessageEvent) => void;
  private isDestroyed = false;

  constructor(options: PostMessageTransportOptions) {
    this.router = options.router;
    this.onStorageAccessRequired = options.onStorageAccessRequired;
    this.onReady = options.onReady;
    this.win = options.window ?? window;

    // Bind the handler to preserve `this` context
    this.messageHandler = this.handleMessage.bind(this);

    // Start listening for messages
    this.win.addEventListener('message', this.messageHandler);
  }

  /**
   * Handle an incoming message event.
   */
  private async handleMessage(event: MessageEvent): Promise<void> {
    if (this.isDestroyed) return;

    // Ignore messages from self
    if (event.origin === this.win.location.origin) return;

    // Ignore messages without a source (can't respond)
    if (!event.source) return;

    // Ignore non-object messages
    if (typeof event.data !== 'object' || event.data === null) return;

    // Handle the message through the router
    const response = await this.router.handleMessage(event.origin, event.data);

    // Send the response back
    this.sendResponse(event.source as MessageEventSource, event.origin, response);
  }

  /**
   * Send a response message back to the client.
   */
  private sendResponse(
    source: MessageEventSource | null,
    origin: string,
    response: ResponseMessage
  ): void {
    if (!source) return;
    source.postMessage(response, { targetOrigin: origin } as WindowPostMessageOptions);
  }

  /**
   * Signal to the parent window that the frame is ready.
   *
   * This should be called after initialization is complete
   * (e.g., after storage access is granted).
   */
  signalReady(): void {
    if (this.isDestroyed) return;

    // Signal to parent that frame is ready
    if (this.win.parent !== this.win) {
      this.win.parent.postMessage({ type: '__FRAME_READY__' }, '*');
    }

    // Call the onReady callback
    this.onReady?.();
  }

  /**
   * Signal that storage access is required.
   *
   * This is used when the frame needs user interaction
   * to gain storage access in cross-origin iframe context.
   */
  signalStorageAccessRequired(): void {
    if (this.isDestroyed) return;

    // Signal to parent that storage access is required
    if (this.win.parent !== this.win) {
      this.win.parent.postMessage({ type: '__STORAGE_ACCESS_REQUIRED__' }, '*');
    }

    // Call the callback
    this.onStorageAccessRequired?.();
  }

  /**
   * Signal that storage access has been granted.
   */
  signalStorageAccessGranted(): void {
    if (this.isDestroyed) return;

    // Signal to parent that storage access was granted
    if (this.win.parent !== this.win) {
      this.win.parent.postMessage({ type: '__STORAGE_ACCESS_GRANTED__' }, '*');
    }
  }

  /**
   * Clean up the transport by removing event listeners.
   */
  destroy(): void {
    this.isDestroyed = true;
    this.win.removeEventListener('message', this.messageHandler);
  }
}

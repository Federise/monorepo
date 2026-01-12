/**
 * LogClient - Direct gateway access using capability tokens
 *
 * This client bypasses the Federise frame and connects directly to a gateway
 * using a self-contained capability token. Useful for recipients who don't
 * need a Federise account - they just need the share link.
 */

import type { LogEvent } from './types';

export interface LogClientOptions {
  /** The capability token from the share URL fragment */
  token: string;
}

interface DecodedToken {
  logId: string;
  gatewayUrl: string;
  permissions: ('read' | 'write')[];
  authorId: string;
  expiresAt: number;
  rawToken: string;
}

/**
 * Client for accessing logs directly via capability token.
 * Recipients use this to read/write without connecting to Federise.
 */
export class LogClient {
  private tokenData: DecodedToken;

  constructor(options: LogClientOptions) {
    this.tokenData = this.decodeToken(options.token);
  }

  /** The log ID this client is connected to */
  get logId(): string {
    return this.tokenData.logId;
  }

  /** The author ID assigned to this token */
  get authorId(): string {
    return this.tokenData.authorId;
  }

  /** Whether this token has read permission */
  get canRead(): boolean {
    return this.tokenData.permissions.includes('read');
  }

  /** Whether this token has write permission */
  get canWrite(): boolean {
    return this.tokenData.permissions.includes('write');
  }

  /** Whether this token has expired */
  get isExpired(): boolean {
    return Date.now() / 1000 > this.tokenData.expiresAt;
  }

  /** Token expiry time as Date */
  get expiresAt(): Date {
    return new Date(this.tokenData.expiresAt * 1000);
  }

  /**
   * Read events from the log.
   * @param afterSeq - Only return events after this sequence number (for polling)
   * @param limit - Maximum number of events to return (default 50)
   */
  async read(
    afterSeq?: number,
    limit?: number
  ): Promise<{ events: LogEvent[]; hasMore: boolean }> {
    if (!this.canRead) {
      throw new Error('Token does not have read permission');
    }
    if (this.isExpired) {
      throw new Error('Token has expired');
    }

    const response = await fetch(`${this.tokenData.gatewayUrl}/log/read`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Log-Token': this.tokenData.rawToken,
      },
      body: JSON.stringify({
        logId: this.tokenData.logId,
        afterSeq,
        limit,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * Append an event to the log.
   * @param content - The message content
   */
  async append(content: string): Promise<LogEvent> {
    if (!this.canWrite) {
      throw new Error('Token does not have write permission');
    }
    if (this.isExpired) {
      throw new Error('Token has expired');
    }

    const response = await fetch(`${this.tokenData.gatewayUrl}/log/append`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Log-Token': this.tokenData.rawToken,
      },
      body: JSON.stringify({
        logId: this.tokenData.logId,
        authorId: this.tokenData.authorId,
        content,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    const result = await response.json();
    return result.event;
  }

  /**
   * Decode and validate a capability token.
   */
  private decodeToken(token: string): DecodedToken {
    try {
      // Base64url decode
      const decoded = this.base64UrlDecode(token);
      const data = JSON.parse(decoded);

      // Map compact format to full format
      const permissions: ('read' | 'write')[] = data.p.map((p: string) =>
        p === 'r' ? 'read' : 'write'
      );

      return {
        logId: data.l,
        gatewayUrl: data.g,
        permissions,
        authorId: data.a,
        expiresAt: data.e,
        rawToken: token,
      };
    } catch (err) {
      throw new Error('Invalid capability token');
    }
  }

  private base64UrlDecode(str: string): string {
    // Add padding if needed
    let padded = str.replace(/-/g, '+').replace(/_/g, '/');
    const padding = padded.length % 4;
    if (padding) {
      padded += '='.repeat(4 - padding);
    }
    return atob(padded);
  }
}

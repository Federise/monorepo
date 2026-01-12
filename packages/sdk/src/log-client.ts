/**
 * LogClient - Direct gateway access using capability tokens
 *
 * This client bypasses the Federise frame and connects directly to a gateway
 * using a self-contained capability token. Useful for recipients who don't
 * need a Federise account - they just need the share link.
 *
 * Token Formats:
 * - V2 (compact): ~46 chars, requires gatewayUrl to be passed separately
 * - V1 (legacy): ~200+ chars, contains gatewayUrl in token (backwards compat)
 */

import type { LogEvent } from './types';

export interface LogClientOptions {
  /** The capability token from the share URL fragment */
  token: string;
  /** Gateway URL - required for V2 tokens, optional for V1 tokens (extracted from token) */
  gatewayUrl?: string;
}

interface DecodedToken {
  logId: string;
  gatewayUrl: string;
  permissions: ('read' | 'write')[];
  authorId: string;
  expiresAt: number;
  rawToken: string;
}

// Permission bitmap values (must match gateway)
const PERM_READ = 0x01;
const PERM_WRITE = 0x02;

/**
 * Client for accessing logs directly via capability token.
 * Recipients use this to read/write without connecting to Federise.
 */
export class LogClient {
  private tokenData: DecodedToken;

  constructor(options: LogClientOptions) {
    this.tokenData = this.decodeToken(options.token, options.gatewayUrl);
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
   * Supports both V1 (JSON) and V2 (binary) formats.
   */
  private decodeToken(token: string, gatewayUrl?: string): DecodedToken {
    try {
      // V1 JSON format starts with "ey" (base64 of "{")
      if (token.startsWith('ey')) {
        return this.decodeV1Token(token, gatewayUrl);
      } else {
        return this.decodeV2Token(token, gatewayUrl);
      }
    } catch (err) {
      throw new Error('Invalid capability token');
    }
  }

  /**
   * Decode V1 (JSON) token - backwards compatibility.
   */
  private decodeV1Token(token: string, gatewayUrlOverride?: string): DecodedToken {
    const decoded = this.base64UrlDecode(token);
    const data = JSON.parse(decoded);

    // Map compact format to full format
    const permissions: ('read' | 'write')[] = data.p.map((p: string) =>
      p === 'r' ? 'read' : 'write'
    );

    return {
      logId: data.l,
      gatewayUrl: gatewayUrlOverride || data.g,
      permissions,
      authorId: data.a,
      expiresAt: data.e,
      rawToken: token,
    };
  }

  /**
   * Decode V2 (binary) token - compact format.
   */
  private decodeV2Token(token: string, gatewayUrl?: string): DecodedToken {
    if (!gatewayUrl) {
      throw new Error('gatewayUrl is required for V2 tokens');
    }

    const bytes = this.base64UrlDecodeBytes(token);

    if (bytes.length !== 34) {
      throw new Error('Invalid V2 token length');
    }

    // Check version
    if (bytes[0] !== 0x02) {
      throw new Error('Invalid token version');
    }

    // Parse logId (8 bytes = 16 hex chars)
    const logIdBytes = bytes.slice(1, 9);
    const logId = Array.from(logIdBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    // Parse permissions
    const permByte = bytes[9];
    const permissions: ('read' | 'write')[] = [];
    if (permByte & PERM_READ) permissions.push('read');
    if (permByte & PERM_WRITE) permissions.push('write');

    // Parse authorId (4 bytes = 8 hex chars)
    const authorIdBytes = bytes.slice(10, 14);
    const authorId = Array.from(authorIdBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    // Parse expiresAt (4 bytes, big-endian uint32)
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    const expiresAt = view.getUint32(14, false); // big-endian

    return {
      logId,
      gatewayUrl,
      permissions,
      authorId,
      expiresAt,
      rawToken: token,
    };
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

  private base64UrlDecodeBytes(str: string): Uint8Array {
    let padded = str.replace(/-/g, '+').replace(/_/g, '/');
    const padding = padded.length % 4;
    if (padding) {
      padded += '='.repeat(4 - padding);
    }
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}

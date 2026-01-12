/**
 * LogClient - Direct gateway access using capability tokens
 *
 * This client bypasses the Federise frame and connects directly to a gateway
 * using a self-contained capability token. Useful for recipients who don't
 * need a Federise account - they just need the share link.
 *
 * Token Formats:
 * - V3 (ultra-compact): ~34 chars, newest format
 * - V2 (compact): ~46 chars
 * - V1 (legacy): ~200+ chars, contains gatewayUrl in token
 */

import type { LogEvent } from './types';

// Default gateway URL for production
const DEFAULT_GATEWAY_URL = 'https://federise-gateway.damen.workers.dev';

// V3 epoch: 2024-01-01 00:00:00 UTC (in seconds)
const V3_EPOCH = 1704067200;

// Permission bitmap values (must match gateway)
const PERM_READ = 0x01;
const PERM_WRITE = 0x02;

export interface LogClientOptions {
  /** The capability token from the share URL fragment */
  token: string;
  /** Gateway URL - defaults to production gateway, can be overridden */
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
   * Supports V1 (JSON), V2 (binary), and V3 (ultra-compact) formats.
   */
  private decodeToken(token: string, gatewayUrl?: string): DecodedToken {
    try {
      // V1 JSON format starts with "ey" (base64 of "{")
      if (token.startsWith('ey')) {
        return this.decodeV1Token(token, gatewayUrl);
      }

      // Binary formats - check length and version
      const bytes = this.base64UrlDecodeBytes(token);

      if (bytes.length === 25 && bytes[0] === 0x03) {
        return this.decodeV3Token(bytes, token, gatewayUrl);
      } else if (bytes.length === 34 && bytes[0] === 0x02) {
        return this.decodeV2Token(bytes, token, gatewayUrl);
      }

      throw new Error('Unknown token format');
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
      gatewayUrl: gatewayUrlOverride || data.g || DEFAULT_GATEWAY_URL,
      permissions,
      authorId: data.a,
      expiresAt: data.e,
      rawToken: token,
    };
  }

  /**
   * Decode V2 (binary) token - compact format.
   */
  private decodeV2Token(bytes: Uint8Array, token: string, gatewayUrl?: string): DecodedToken {
    const resolvedGatewayUrl = gatewayUrl || DEFAULT_GATEWAY_URL;

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
      gatewayUrl: resolvedGatewayUrl,
      permissions,
      authorId,
      expiresAt,
      rawToken: token,
    };
  }

  /**
   * Decode V3 (ultra-compact binary) token.
   */
  private decodeV3Token(bytes: Uint8Array, token: string, gatewayUrl?: string): DecodedToken {
    const resolvedGatewayUrl = gatewayUrl || DEFAULT_GATEWAY_URL;

    // Parse logId (6 bytes = 12 hex chars)
    const logIdBytes = bytes.slice(1, 7);
    const logId = Array.from(logIdBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    // Parse permissions
    const permByte = bytes[7];
    const permissions: ('read' | 'write')[] = [];
    if (permByte & PERM_READ) permissions.push('read');
    if (permByte & PERM_WRITE) permissions.push('write');

    // Parse authorId (2 bytes = 4 hex chars)
    const authorIdBytes = bytes.slice(8, 10);
    const authorId = Array.from(authorIdBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    // Parse expiresAt (3 bytes, big-endian uint24 - hours since V3 epoch)
    const hoursFromEpoch = (bytes[10] << 16) | (bytes[11] << 8) | bytes[12];
    const expiresAt = V3_EPOCH + (hoursFromEpoch * 3600);

    return {
      logId,
      gatewayUrl: resolvedGatewayUrl,
      permissions,
      authorId,
      expiresAt,
      rawToken: token,
    };
  }

  private base64UrlDecode(str: string): string {
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

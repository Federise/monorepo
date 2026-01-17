/**
 * ChannelClient - Direct gateway access using capability tokens
 *
 * This client bypasses the Federise frame and connects directly to a gateway
 * using a self-contained capability token. Useful for recipients who don't
 * need a Federise account - they just need the share link.
 *
 * Token Formats:
 * - V4 (variable-length): ~40-70 chars, supports display names
 * - V3 (ultra-compact): ~34 chars
 * - V2 (compact): ~46 chars
 * - V1 (legacy): ~200+ chars, contains gatewayUrl in token
 */

import type { ChannelEvent, ChannelPermission } from './types';

// Default gateway URL for production
const DEFAULT_GATEWAY_URL = 'https://federise-gateway.damen.workers.dev';

// V3/V4 epoch: 2024-01-01 00:00:00 UTC (in seconds)
const V3_EPOCH = 1704067200;

// Permission bitmap values (must match gateway)
const PERM_READ = 0x01;
const PERM_WRITE = 0x02; // Legacy 'write', now 'append'
const PERM_APPEND = 0x02;
const PERM_READ_DELETED = 0x04;
const PERM_DELETE_OWN = 0x08;
const PERM_DELETE_ANY = 0x10;

export interface ChannelClientOptions {
  /** The capability token from the share URL fragment */
  token: string;
  /** Gateway URL - defaults to production gateway, can be overridden */
  gatewayUrl?: string;
}

interface DecodedToken {
  channelId: string;
  gatewayUrl: string;
  permissions: ChannelPermission[];
  authorId: string;
  expiresAt: number;
  rawToken: string;
}

/**
 * Client for accessing channels directly via capability token.
 * Recipients use this to read/write without connecting to Federise.
 */
export class ChannelClient {
  private tokenData: DecodedToken;

  constructor(options: ChannelClientOptions) {
    this.tokenData = this.decodeToken(options.token, options.gatewayUrl);
  }

  /** The channel ID this client is connected to */
  get channelId(): string {
    return this.tokenData.channelId;
  }

  /** The author ID assigned to this token */
  get authorId(): string {
    return this.tokenData.authorId;
  }

  /** Whether this token has read permission */
  get canRead(): boolean {
    return this.tokenData.permissions.includes('read');
  }

  /** Whether this token has append permission (formerly 'write') */
  get canAppend(): boolean {
    return this.tokenData.permissions.includes('append');
  }

  /** @deprecated Use canAppend instead */
  get canWrite(): boolean {
    return this.canAppend;
  }

  /** Whether this token can read deleted events */
  get canReadDeleted(): boolean {
    return this.tokenData.permissions.includes('read:deleted');
  }

  /** Whether this token can delete own events */
  get canDeleteOwn(): boolean {
    return this.tokenData.permissions.includes('delete:own');
  }

  /** Whether this token can delete any event */
  get canDeleteAny(): boolean {
    return this.tokenData.permissions.includes('delete:any');
  }

  /** Whether this token has any delete permission */
  get canDelete(): boolean {
    return this.canDeleteOwn || this.canDeleteAny;
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
   * Read events from the channel.
   * @param afterSeq - Only return events after this sequence number (for polling)
   * @param limit - Maximum number of events to return (default 50)
   */
  async read(
    afterSeq?: number,
    limit?: number
  ): Promise<{ events: ChannelEvent[]; hasMore: boolean }> {
    if (!this.canRead) {
      throw new Error('Token does not have read permission');
    }
    if (this.isExpired) {
      throw new Error('Token has expired');
    }

    const response = await fetch(`${this.tokenData.gatewayUrl}/channel/read`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Channel-Token': this.tokenData.rawToken,
      },
      body: JSON.stringify({
        channelId: this.tokenData.channelId,
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
   * Append an event to the channel.
   * @param content - The message content
   */
  async append(content: string): Promise<ChannelEvent> {
    if (!this.canAppend) {
      throw new Error('Token does not have append permission');
    }
    if (this.isExpired) {
      throw new Error('Token has expired');
    }

    const response = await fetch(`${this.tokenData.gatewayUrl}/channel/append`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Channel-Token': this.tokenData.rawToken,
      },
      body: JSON.stringify({
        channelId: this.tokenData.channelId,
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
   * Soft-delete an event in the channel.
   * @param targetSeq - The sequence number of the event to delete
   */
  async deleteEvent(targetSeq: number): Promise<ChannelEvent> {
    if (!this.canDelete) {
      throw new Error('Token does not have delete permission');
    }
    if (this.isExpired) {
      throw new Error('Token has expired');
    }

    const response = await fetch(`${this.tokenData.gatewayUrl}/channel/delete-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Channel-Token': this.tokenData.rawToken,
      },
      body: JSON.stringify({
        channelId: this.tokenData.channelId,
        targetSeq,
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
   * Supports V1 (JSON), V2 (binary), V3 (ultra-compact), and V4 (variable-length) formats.
   */
  private decodeToken(token: string, gatewayUrl?: string): DecodedToken {
    try {
      // V1 JSON format starts with "ey" (base64 of "{")
      if (token.startsWith('ey')) {
        return this.decodeV1Token(token, gatewayUrl);
      }

      // Binary formats - check version byte
      const bytes = this.base64UrlDecodeBytes(token);

      if (bytes[0] === 0x04) {
        // V4 format - variable length
        return this.decodeV4Token(bytes, token, gatewayUrl);
      } else if (bytes.length === 25 && bytes[0] === 0x03) {
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

    // Map compact format to full format ('w' maps to 'append')
    const permissions: ChannelPermission[] = data.p.map((p: string) =>
      p === 'r' ? 'read' : 'append'
    );

    return {
      channelId: data.l,
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

    // Parse channelId (8 bytes = 16 hex chars)
    const channelIdBytes = bytes.slice(1, 9);
    const channelId = Array.from(channelIdBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    // Parse permissions (V2 only supports read/append)
    const permByte = bytes[9];
    const permissions = this.bitmapToPermissions(permByte);

    // Parse authorId (4 bytes = 8 hex chars)
    const authorIdBytes = bytes.slice(10, 14);
    const authorId = Array.from(authorIdBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    // Parse expiresAt (4 bytes, big-endian uint32)
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    const expiresAt = view.getUint32(14, false); // big-endian

    return {
      channelId,
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

    // Parse channelId (6 bytes = 12 hex chars)
    const channelIdBytes = bytes.slice(1, 7);
    const channelId = Array.from(channelIdBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    // Parse permissions
    const permByte = bytes[7];
    const permissions = this.bitmapToPermissions(permByte);

    // Parse authorId (2 bytes = 4 hex chars)
    const authorIdBytes = bytes.slice(8, 10);
    const authorId = Array.from(authorIdBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    // Parse expiresAt (3 bytes, big-endian uint24 - hours since V3 epoch)
    const hoursFromEpoch = (bytes[10] << 16) | (bytes[11] << 8) | bytes[12];
    const expiresAt = V3_EPOCH + (hoursFromEpoch * 3600);

    return {
      channelId,
      gatewayUrl: resolvedGatewayUrl,
      permissions,
      authorId,
      expiresAt,
      rawToken: token,
    };
  }

  /**
   * Decode V4 (variable-length authorId) token.
   */
  private decodeV4Token(bytes: Uint8Array, token: string, gatewayUrl?: string): DecodedToken {
    const resolvedGatewayUrl = gatewayUrl || DEFAULT_GATEWAY_URL;

    // Read authorIdLen to determine layout
    const authorIdLen = bytes[8];
    if (authorIdLen < 1 || authorIdLen > 32) {
      throw new Error('Invalid authorId length in V4 token');
    }

    // Parse channelId (6 bytes = 12 hex chars)
    const channelIdBytes = bytes.slice(1, 7);
    const channelId = Array.from(channelIdBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    // Parse permissions (extended bitmap)
    const permByte = bytes[7];
    const permissions = this.bitmapToPermissions(permByte);

    // Parse authorId (variable length UTF-8)
    const authorIdBytes = bytes.slice(9, 9 + authorIdLen);
    const authorId = new TextDecoder().decode(authorIdBytes);

    // Parse expiresAt (3 bytes, big-endian uint24 - hours since V3 epoch)
    const expiryOffset = 9 + authorIdLen;
    const hoursFromEpoch = (bytes[expiryOffset] << 16) | (bytes[expiryOffset + 1] << 8) | bytes[expiryOffset + 2];
    const expiresAt = V3_EPOCH + (hoursFromEpoch * 3600);

    return {
      channelId,
      gatewayUrl: resolvedGatewayUrl,
      permissions,
      authorId,
      expiresAt,
      rawToken: token,
    };
  }

  /**
   * Convert permission bitmap to permission array.
   */
  private bitmapToPermissions(permByte: number): ChannelPermission[] {
    const permissions: ChannelPermission[] = [];
    if (permByte & PERM_READ) permissions.push('read');
    if (permByte & PERM_APPEND) permissions.push('append');
    if (permByte & PERM_READ_DELETED) permissions.push('read:deleted');
    if (permByte & PERM_DELETE_OWN) permissions.push('delete:own');
    if (permByte & PERM_DELETE_ANY) permissions.push('delete:any');
    return permissions;
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

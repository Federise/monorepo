/**
 * Channel Capability Token Utilities
 *
 * Creates and verifies self-contained capability tokens for channel access.
 *
 * Token Format (variable-length authorId, ~40-70 chars):
 *   version(1) + channelId(6) + permissions(1) + authorIdLen(1) + authorId(1-32) + expiresAt(3) + signature(12)
 *   Base64url encoded = ~40-70 characters depending on authorId length
 *
 * Recipients can use these tokens to access channels directly without a Federise account.
 */

export type TokenPermission = "read" | "append" | "read:deleted" | "delete:own" | "delete:any";

export interface CreateTokenParams {
  channelId: string;
  permissions: TokenPermission[];
  authorId?: string;
  displayName?: string;
  expiresInSeconds: number;
}

export interface VerifiedToken {
  channelId: string;
  permissions: TokenPermission[];
  authorId: string;
  expiresAt: number;
}

// Permission bitmap values
const PERM_READ = 0x01;
const PERM_APPEND = 0x02;
const PERM_READ_DELETED = 0x04;
const PERM_DELETE_OWN = 0x08;
const PERM_DELETE_ANY = 0x10;

// Epoch: 2024-01-01 00:00:00 UTC (in seconds)
const TOKEN_EPOCH = 1704067200;
const TOKEN_VERSION = 0x04;

/**
 * Convert permissions array to bitmap byte.
 */
function permissionsToBitmap(permissions: TokenPermission[]): number {
  let permByte = 0;
  for (const p of permissions) {
    switch (p) {
      case "read": permByte |= PERM_READ; break;
      case "append": permByte |= PERM_APPEND; break;
      case "read:deleted": permByte |= PERM_READ_DELETED; break;
      case "delete:own": permByte |= PERM_DELETE_OWN; break;
      case "delete:any": permByte |= PERM_DELETE_ANY; break;
    }
  }
  return permByte;
}

/**
 * Convert bitmap byte to permissions array.
 */
function bitmapToPermissions(permByte: number): TokenPermission[] {
  const permissions: TokenPermission[] = [];
  if (permByte & PERM_READ) permissions.push("read");
  if (permByte & PERM_APPEND) permissions.push("append");
  if (permByte & PERM_READ_DELETED) permissions.push("read:deleted");
  if (permByte & PERM_DELETE_OWN) permissions.push("delete:own");
  if (permByte & PERM_DELETE_ANY) permissions.push("delete:any");
  return permissions;
}

/**
 * Create a capability token for channel access.
 */
export async function createChannelToken(
  params: CreateTokenParams,
  secret: string
): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = Math.floor(Date.now() / 1000) + params.expiresInSeconds;

  // Determine authorId: use displayName, or provided authorId, or generate ID
  const authorId = params.displayName || params.authorId ||
    crypto.randomUUID().replace(/-/g, "").slice(0, 4);

  // Encode authorId as UTF-8 bytes
  const authorIdBytes = new TextEncoder().encode(authorId);
  if (authorIdBytes.length > 32) {
    throw new Error("Author name too long (max 32 bytes UTF-8)");
  }
  if (authorIdBytes.length === 0) {
    throw new Error("Author name cannot be empty");
  }

  // Convert permissions to bitmap
  const permByte = permissionsToBitmap(params.permissions);

  // Ensure channelId is 12 hex chars (6 bytes)
  const channelIdHex = params.channelId.replace(/-/g, "").slice(0, 12).padEnd(12, "0");

  // Convert expiresAt to hours since epoch
  const hoursFromEpoch = Math.floor((expiresAt - TOKEN_EPOCH) / 3600);
  if (hoursFromEpoch < 0 || hoursFromEpoch > 0xFFFFFF) {
    throw new Error("Expiry time out of range");
  }

  // Build payload: version(1) + channelId(6) + perm(1) + authorIdLen(1) + authorId(N) + expiry(3)
  const payloadLen = 1 + 6 + 1 + 1 + authorIdBytes.length + 3;
  const payload = new Uint8Array(payloadLen);

  payload[0] = TOKEN_VERSION;

  // ChannelId (6 bytes from hex)
  for (let i = 0; i < 6; i++) {
    payload[1 + i] = parseInt(channelIdHex.slice(i * 2, i * 2 + 2), 16);
  }

  // Permissions (1 byte)
  payload[7] = permByte;

  // AuthorId length (1 byte)
  payload[8] = authorIdBytes.length;

  // AuthorId (variable length)
  payload.set(authorIdBytes, 9);

  // ExpiresAt (3 bytes, big-endian uint24)
  const expiryOffset = 9 + authorIdBytes.length;
  payload[expiryOffset] = (hoursFromEpoch >> 16) & 0xFF;
  payload[expiryOffset + 1] = (hoursFromEpoch >> 8) & 0xFF;
  payload[expiryOffset + 2] = hoursFromEpoch & 0xFF;

  // Sign the payload
  const signature = await signBinary(payload, secret);
  const truncatedSig = signature.slice(0, 12);

  // Combine payload + signature
  const token = new Uint8Array(payloadLen + 12);
  token.set(payload, 0);
  token.set(truncatedSig, payloadLen);

  return { token: base64UrlEncode(token), expiresAt };
}

/**
 * Verify and decode a capability token.
 * Returns the decoded token data if valid, null if invalid or expired.
 */
export async function verifyChannelToken(
  tokenString: string,
  secret: string
): Promise<VerifiedToken | null> {
  try {
    const bytes = base64UrlDecodeBytes(tokenString);

    // Validate version byte
    if (bytes[0] !== TOKEN_VERSION) {
      return null;
    }

    // Minimum length: 1 + 6 + 1 + 1 + 1 + 3 + 12 = 25 bytes (1-char authorId)
    // Maximum length: 1 + 6 + 1 + 1 + 32 + 3 + 12 = 56 bytes (32-char authorId)
    if (bytes.length < 25 || bytes.length > 56) {
      return null;
    }

    // Read authorIdLen to determine payload size
    const authorIdLen = bytes[8];
    if (authorIdLen < 1 || authorIdLen > 32) {
      return null;
    }

    // Expected payload length: 1 + 6 + 1 + 1 + authorIdLen + 3 = 12 + authorIdLen
    const payloadLen = 12 + authorIdLen;
    const expectedTotalLen = payloadLen + 12; // payload + signature

    if (bytes.length !== expectedTotalLen) {
      return null;
    }

    // Extract payload and signature
    const payload = bytes.slice(0, payloadLen);
    const providedSig = bytes.slice(payloadLen, payloadLen + 12);

    // Verify signature
    const expectedSig = await signBinary(payload, secret);
    const truncatedExpected = expectedSig.slice(0, 12);

    if (!timingSafeEqualBytes(providedSig, truncatedExpected)) {
      return null;
    }

    // Parse channelId (6 bytes = 12 hex chars)
    const channelIdBytes = bytes.slice(1, 7);
    const channelId = Array.from(channelIdBytes).map(b => b.toString(16).padStart(2, "0")).join("");

    // Parse permissions
    const permByte = bytes[7];
    const permissions = bitmapToPermissions(permByte);

    // Parse authorId (variable length UTF-8)
    const authorIdBytes = bytes.slice(9, 9 + authorIdLen);
    const authorId = new TextDecoder().decode(authorIdBytes);

    // Parse expiresAt (3 bytes, big-endian uint24 - hours since epoch)
    const expiryOffset = 9 + authorIdLen;
    const hoursFromEpoch = (bytes[expiryOffset] << 16) | (bytes[expiryOffset + 1] << 8) | bytes[expiryOffset + 2];
    const expiresAt = TOKEN_EPOCH + (hoursFromEpoch * 3600);

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (expiresAt < now) {
      return null;
    }

    return {
      channelId,
      permissions,
      authorId,
      expiresAt,
    };
  } catch {
    return null;
  }
}

/**
 * Parse a token without verifying signature (for extracting channelId to look up secret).
 * Returns null if token is malformed.
 */
export function parseChannelToken(tokenString: string): { channelId: string } | null {
  try {
    const bytes = base64UrlDecodeBytes(tokenString);

    // Validate version and minimum length
    if (bytes[0] !== TOKEN_VERSION || bytes.length < 25 || bytes.length > 56) {
      return null;
    }

    const authorIdLen = bytes[8];
    if (authorIdLen < 1 || authorIdLen > 32) {
      return null;
    }

    const expectedLen = 12 + authorIdLen + 12;
    if (bytes.length !== expectedLen) {
      return null;
    }

    const channelIdBytes = bytes.slice(1, 7);
    const channelId = Array.from(channelIdBytes).map(b => b.toString(16).padStart(2, "0")).join("");
    return { channelId };
  } catch {
    return null;
  }
}

/**
 * Sign binary payload using HMAC-SHA256.
 */
async function signBinary(
  data: Uint8Array,
  secret: string
): Promise<Uint8Array> {
  const encoder = new TextEncoder();

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, buffer);
  return new Uint8Array(signature);
}

/**
 * Encode bytes as base64url.
 */
function base64UrlEncode(data: Uint8Array): string {
  const str = String.fromCharCode(...data);
  const base64 = btoa(str);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Decode base64url to bytes.
 */
function base64UrlDecodeBytes(str: string): Uint8Array {
  let padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4;
  if (padding) {
    padded += "=".repeat(4 - padding);
  }
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Timing-safe byte array comparison.
 */
function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

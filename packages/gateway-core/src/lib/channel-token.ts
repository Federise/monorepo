/**
 * Channel Capability Token Utilities
 *
 * Creates and verifies self-contained capability tokens for channel access.
 *
 * V4 Format (variable-length authorId, ~40-70 chars):
 *   version(1) + channelId(6) + permissions(1) + authorIdLen(1) + authorId(1-32) + expiresAt(3) + signature(12)
 *   Base64url encoded = ~40-70 characters depending on authorId length
 *
 * V3 Format (ultra-compact, ~34 chars):
 *   version(1) + channelId(6) + permissions(1) + authorId(2) + expiresAt(3) + signature(12) = 25 bytes
 *   Base64url encoded = ~34 characters
 *
 * V2 Format (compact binary, ~46 chars):
 *   version(1) + channelId(8) + permissions(1) + authorId(4) + expiresAt(4) + signature(16) = 34 bytes
 *
 * V1 Format (legacy JSON, ~200+ chars):
 *   JSON object with keys: l, g, p, a, e, s
 *
 * Recipients can use these tokens to access channels directly without a Federise account.
 */

import type { ChannelCapabilityTokenV1, ChannelPermission } from "../types.js";

// New permission type using extended permission set
export type TokenPermission = ChannelPermission;

// Legacy permission type for backward compatibility
export type LegacyPermission = "read" | "write";

export interface CreateTokenParams {
  channelId: string;
  permissions: (TokenPermission | LegacyPermission)[];
  authorId?: string; // Optional - will be auto-generated if not provided
  displayName?: string; // User-provided name (becomes authorId in V4)
  expiresInSeconds: number;
}

export interface VerifiedToken {
  channelId: string;
  permissions: TokenPermission[];
  authorId: string;
  expiresAt: number;
}

// Permission bitmap values (extended for V4)
const PERM_READ = 0x01;
const PERM_WRITE = 0x02; // Legacy 'write', now 'append'
const PERM_APPEND = 0x02; // Same as PERM_WRITE for compatibility
const PERM_READ_DELETED = 0x04;
const PERM_DELETE_OWN = 0x08;
const PERM_DELETE_ANY = 0x10;

// V3/V4 epoch: 2024-01-01 00:00:00 UTC (in seconds)
const V3_EPOCH = 1704067200;

/**
 * Convert permissions array to bitmap byte.
 */
function permissionsToBitmap(permissions: (TokenPermission | LegacyPermission)[]): number {
  let permByte = 0;
  for (const p of permissions) {
    switch (p) {
      case "read": permByte |= PERM_READ; break;
      case "write": // Legacy - map to append
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
 * Check if V4 format is needed (displayName provided or new permissions used).
 */
function needsV4Format(params: CreateTokenParams): boolean {
  // V4 is needed if displayName is provided
  if (params.displayName) return true;

  // V4 is needed if new permissions are used
  const newPermissions = ["read:deleted", "delete:own", "delete:any"];
  return params.permissions.some(p => newPermissions.includes(p as string));
}

/**
 * Create a capability token for channel access.
 * Uses V4 format if displayName is provided or new permissions are used, otherwise V3.
 */
export async function createChannelToken(
  params: CreateTokenParams,
  secret: string
): Promise<{ token: string; expiresAt: number }> {
  // Determine authorId: use displayName, or provided authorId, or generate hex ID
  const authorId = params.displayName || params.authorId ||
    crypto.randomUUID().replace(/-/g, "").slice(0, 4);

  // Use V4 if needed, otherwise V3 for compactness
  if (needsV4Format(params)) {
    return createV4Token({ ...params, authorId }, secret);
  } else {
    return createV3Token({ ...params, authorId }, secret);
  }
}

/**
 * Create a V4 capability token with variable-length authorId.
 * V4 Format: version(1) + channelId(6) + perm(1) + authorIdLen(1) + authorId(1-32) + expiry(3) + sig(12)
 */
async function createV4Token(
  params: CreateTokenParams & { authorId: string },
  secret: string
): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = Math.floor(Date.now() / 1000) + params.expiresInSeconds;

  // Encode authorId as UTF-8 bytes
  const authorIdBytes = new TextEncoder().encode(params.authorId);
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
  const hoursFromEpoch = Math.floor((expiresAt - V3_EPOCH) / 3600);
  if (hoursFromEpoch < 0 || hoursFromEpoch > 0xFFFFFF) {
    throw new Error("Expiry time out of range for V4 token");
  }

  // Build payload: version(1) + channelId(6) + perm(1) + authorIdLen(1) + authorId(N) + expiry(3)
  const payloadLen = 1 + 6 + 1 + 1 + authorIdBytes.length + 3;
  const payload = new Uint8Array(payloadLen);

  payload[0] = 0x04; // Version 4

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
 * Create a compact V3 capability token for channel access.
 * V3 is the most compact format at ~34 characters.
 */
async function createV3Token(
  params: CreateTokenParams & { authorId: string },
  secret: string
): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = Math.floor(Date.now() / 1000) + params.expiresInSeconds;

  // Convert permissions to bitmap (only read/append supported in V3)
  const permByte = permissionsToBitmap(params.permissions);

  // Ensure channelId is 12 hex chars (6 bytes) for V3
  const channelIdHex = params.channelId.replace(/-/g, "").slice(0, 12).padEnd(12, "0");

  // Ensure authorId is 4 hex chars (2 bytes) for V3
  const authorIdHex = params.authorId.replace(/-/g, "").slice(0, 4).padEnd(4, "0");

  // Convert expiresAt to hours since V3 epoch (fits in 3 bytes for ~1900 years)
  const hoursFromEpoch = Math.floor((expiresAt - V3_EPOCH) / 3600);
  if (hoursFromEpoch < 0 || hoursFromEpoch > 0xFFFFFF) {
    throw new Error("Expiry time out of range for V3 token");
  }

  // Build binary payload (without signature): version(1) + channelId(6) + perm(1) + authorId(2) + expiry(3) = 13 bytes
  const payload = new Uint8Array(13);
  payload[0] = 0x03; // Version 3

  // ChannelId (6 bytes from hex)
  for (let i = 0; i < 6; i++) {
    payload[1 + i] = parseInt(channelIdHex.slice(i * 2, i * 2 + 2), 16);
  }

  // Permissions (1 byte)
  payload[7] = permByte;

  // AuthorId (2 bytes from hex)
  for (let i = 0; i < 2; i++) {
    payload[8 + i] = parseInt(authorIdHex.slice(i * 2, i * 2 + 2), 16);
  }

  // ExpiresAt (3 bytes, big-endian uint24 - hours since V3 epoch)
  payload[10] = (hoursFromEpoch >> 16) & 0xFF;
  payload[11] = (hoursFromEpoch >> 8) & 0xFF;
  payload[12] = hoursFromEpoch & 0xFF;

  // Sign the payload
  const signature = await signBinary(payload, secret);

  // Truncate signature to 12 bytes for V3
  const truncatedSig = signature.slice(0, 12);

  // Combine payload + truncated signature = 25 bytes
  const token = new Uint8Array(25);
  token.set(payload, 0);
  token.set(truncatedSig, 13);

  // Encode as base64url
  const tokenString = base64UrlEncode(token);

  return { token: tokenString, expiresAt };
}

/**
 * Verify and decode a capability token (supports V1, V2, V3, and V4 formats).
 * Returns the decoded token data if valid, null if invalid or expired.
 */
export async function verifyChannelToken(
  tokenString: string,
  secret: string
): Promise<VerifiedToken | null> {
  try {
    // Detect format: V1 JSON starts with "ey" (base64 of "{")
    if (tokenString.startsWith("ey")) {
      return verifyV1Token(tokenString, secret);
    }

    // Binary format - check version byte
    const bytes = base64UrlDecodeBytes(tokenString);
    if (bytes[0] === 0x04) {
      // V4: variable length based on authorIdLen
      return verifyV4Token(bytes, secret);
    } else if (bytes.length === 25 && bytes[0] === 0x03) {
      return verifyV3Token(bytes, secret);
    } else if (bytes.length === 34 && bytes[0] === 0x02) {
      return verifyV2Token(bytes, secret);
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Verify V4 (variable-length authorId) token.
 * V4 Format: version(1) + channelId(6) + perm(1) + authorIdLen(1) + authorId(1-32) + expiry(3) + sig(12)
 */
async function verifyV4Token(
  bytes: Uint8Array,
  secret: string
): Promise<VerifiedToken | null> {
  try {
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

    // Parse permissions (use extended bitmap)
    const permByte = bytes[7];
    const permissions = bitmapToPermissions(permByte);

    // Parse authorId (variable length UTF-8)
    const authorIdBytes = bytes.slice(9, 9 + authorIdLen);
    const authorId = new TextDecoder().decode(authorIdBytes);

    // Parse expiresAt (3 bytes, big-endian uint24 - hours since V3 epoch)
    const expiryOffset = 9 + authorIdLen;
    const hoursFromEpoch = (bytes[expiryOffset] << 16) | (bytes[expiryOffset + 1] << 8) | bytes[expiryOffset + 2];
    const expiresAt = V3_EPOCH + (hoursFromEpoch * 3600);

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
 * Verify V3 (ultra-compact binary) token.
 */
async function verifyV3Token(
  bytes: Uint8Array,
  secret: string
): Promise<VerifiedToken | null> {
  try {
    // Extract payload (first 13 bytes)
    const payload = bytes.slice(0, 13);
    const providedSig = bytes.slice(13, 25);

    // Verify signature
    const expectedSig = await signBinary(payload, secret);
    const truncatedExpected = expectedSig.slice(0, 12);

    if (!timingSafeEqualBytes(providedSig, truncatedExpected)) {
      return null;
    }

    // Parse channelId (6 bytes = 12 hex chars)
    const channelIdBytes = bytes.slice(1, 7);
    const channelId = Array.from(channelIdBytes).map(b => b.toString(16).padStart(2, "0")).join("");

    // Parse permissions (use extended bitmap for consistent naming)
    const permByte = bytes[7];
    const permissions = bitmapToPermissions(permByte);

    // Parse authorId (2 bytes = 4 hex chars)
    const authorIdBytes = bytes.slice(8, 10);
    const authorId = Array.from(authorIdBytes).map(b => b.toString(16).padStart(2, "0")).join("");

    // Parse expiresAt (3 bytes, big-endian uint24 - hours since V3 epoch)
    const hoursFromEpoch = (bytes[10] << 16) | (bytes[11] << 8) | bytes[12];
    const expiresAt = V3_EPOCH + (hoursFromEpoch * 3600);

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
 * Verify V2 (compact binary) token.
 */
async function verifyV2Token(
  bytes: Uint8Array,
  secret: string
): Promise<VerifiedToken | null> {
  try {
    // Extract payload (first 18 bytes)
    const payload = bytes.slice(0, 18);
    const providedSig = bytes.slice(18, 34);

    // Verify signature
    const expectedSig = await signBinary(payload, secret);
    const truncatedExpected = expectedSig.slice(0, 16);

    if (!timingSafeEqualBytes(providedSig, truncatedExpected)) {
      return null;
    }

    // Parse channelId (8 bytes = 16 hex chars)
    const channelIdBytes = bytes.slice(1, 9);
    const channelId = Array.from(channelIdBytes).map(b => b.toString(16).padStart(2, "0")).join("");

    // Parse permissions (use extended bitmap for consistent naming)
    const permByte = bytes[9];
    const permissions = bitmapToPermissions(permByte);

    // Parse authorId (4 bytes = 8 hex chars)
    const authorIdBytes = bytes.slice(10, 14);
    const authorId = Array.from(authorIdBytes).map(b => b.toString(16).padStart(2, "0")).join("");

    // Parse expiresAt (4 bytes, big-endian uint32)
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    const expiresAt = view.getUint32(14, false); // big-endian

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
 * Verify V1 (JSON) token for backwards compatibility.
 */
async function verifyV1Token(
  tokenString: string,
  secret: string
): Promise<VerifiedToken | null> {
  try {
    const decoded = base64UrlDecode(tokenString);
    const token = JSON.parse(decoded) as ChannelCapabilityTokenV1;

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (token.e < now) {
      return null;
    }

    // Verify signature
    const { s: signature, ...payload } = token;
    const expectedSig = await signPayloadJson(payload, secret);

    if (!timingSafeEqual(signature, expectedSig)) {
      return null;
    }

    // Convert permissions from compact format (map 'w' to 'append')
    const permissions = token.p.map((p) =>
      p === "r" ? "read" : "append"
    ) as TokenPermission[];

    return {
      channelId: token.l,
      permissions,
      authorId: token.a,
      expiresAt: token.e,
    };
  } catch {
    return null;
  }
}

/**
 * Parse a token without verifying signature (for extracting channelId to look up secret).
 * Returns null if token is malformed.
 */
export function parseChannelToken(tokenString: string): { channelId: string; version: 1 | 2 | 3 | 4 } | null {
  try {
    // V1 JSON format
    if (tokenString.startsWith("ey")) {
      const decoded = base64UrlDecode(tokenString);
      const token = JSON.parse(decoded) as ChannelCapabilityTokenV1;
      return { channelId: token.l, version: 1 };
    }

    // Binary format
    const bytes = base64UrlDecodeBytes(tokenString);

    // V4 format (variable length)
    if (bytes[0] === 0x04 && bytes.length >= 25 && bytes.length <= 56) {
      const authorIdLen = bytes[8];
      if (authorIdLen >= 1 && authorIdLen <= 32) {
        const expectedLen = 12 + authorIdLen + 12; // payload + sig
        if (bytes.length === expectedLen) {
          const channelIdBytes = bytes.slice(1, 7);
          const channelId = Array.from(channelIdBytes).map(b => b.toString(16).padStart(2, "0")).join("");
          return { channelId, version: 4 };
        }
      }
    }

    // V3 format
    if (bytes.length === 25 && bytes[0] === 0x03) {
      const channelIdBytes = bytes.slice(1, 7);
      const channelId = Array.from(channelIdBytes).map(b => b.toString(16).padStart(2, "0")).join("");
      return { channelId, version: 3 };
    }

    // V2 format
    if (bytes.length === 34 && bytes[0] === 0x02) {
      const channelIdBytes = bytes.slice(1, 9);
      const channelId = Array.from(channelIdBytes).map(b => b.toString(16).padStart(2, "0")).join("");
      return { channelId, version: 2 };
    }

    return null;
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

  // Use slice to get a proper ArrayBuffer from the Uint8Array
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, buffer);
  return new Uint8Array(signature);
}

/**
 * Sign JSON payload using HMAC-SHA256 (for V1 compatibility).
 */
async function signPayloadJson(
  payload: Omit<ChannelCapabilityTokenV1, "s">,
  secret: string
): Promise<string> {
  const data = JSON.stringify(payload);
  const encoder = new TextEncoder();

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(data)
  );

  return base64UrlEncode(new Uint8Array(signature));
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
 * Decode base64url to string (for V1 JSON tokens).
 */
function base64UrlDecode(str: string): string {
  let padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4;
  if (padding) {
    padded += "=".repeat(4 - padding);
  }
  return atob(padded);
}

/**
 * Timing-safe string comparison.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
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

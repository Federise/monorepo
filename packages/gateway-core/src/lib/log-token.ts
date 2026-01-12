/**
 * Log Capability Token Utilities
 *
 * Creates and verifies self-contained capability tokens for log access.
 *
 * V3 Format (ultra-compact, ~34 chars):
 *   version(1) + logId(6) + permissions(1) + authorId(2) + expiresAt(3) + signature(12) = 25 bytes
 *   Base64url encoded = ~34 characters
 *
 * V2 Format (compact binary, ~46 chars):
 *   version(1) + logId(8) + permissions(1) + authorId(4) + expiresAt(4) + signature(16) = 34 bytes
 *
 * V1 Format (legacy JSON, ~200+ chars):
 *   JSON object with keys: l, g, p, a, e, s
 *
 * Recipients can use these tokens to access logs directly without a Federise account.
 */

import type { LogCapabilityTokenV1 } from "../types.js";

export interface CreateTokenParams {
  logId: string;
  permissions: ("read" | "write")[];
  authorId: string;
  expiresInSeconds: number;
}

export interface VerifiedToken {
  logId: string;
  permissions: ("read" | "write")[];
  authorId: string;
  expiresAt: number;
}

// Permission bitmap values
const PERM_READ = 0x01;
const PERM_WRITE = 0x02;

// V3 epoch: 2024-01-01 00:00:00 UTC (in seconds)
const V3_EPOCH = 1704067200;

/**
 * Create a compact V3 capability token for log access.
 * V3 is the most compact format at ~34 characters.
 */
export async function createLogToken(
  params: CreateTokenParams,
  secret: string
): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = Math.floor(Date.now() / 1000) + params.expiresInSeconds;

  // Convert permissions to bitmap
  let permByte = 0;
  if (params.permissions.includes("read")) permByte |= PERM_READ;
  if (params.permissions.includes("write")) permByte |= PERM_WRITE;

  // Ensure logId is 12 hex chars (6 bytes) for V3
  const logIdHex = params.logId.replace(/-/g, "").slice(0, 12).padEnd(12, "0");

  // Ensure authorId is 4 hex chars (2 bytes) for V3
  const authorIdHex = params.authorId.replace(/-/g, "").slice(0, 4).padEnd(4, "0");

  // Convert expiresAt to hours since V3 epoch (fits in 3 bytes for ~1900 years)
  const hoursFromEpoch = Math.floor((expiresAt - V3_EPOCH) / 3600);
  if (hoursFromEpoch < 0 || hoursFromEpoch > 0xFFFFFF) {
    throw new Error("Expiry time out of range for V3 token");
  }

  // Build binary payload (without signature): version(1) + logId(6) + perm(1) + authorId(2) + expiry(3) = 13 bytes
  const payload = new Uint8Array(13);
  payload[0] = 0x03; // Version 3

  // LogId (6 bytes from hex)
  for (let i = 0; i < 6; i++) {
    payload[1 + i] = parseInt(logIdHex.slice(i * 2, i * 2 + 2), 16);
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
 * Verify and decode a capability token (supports V1, V2, and V3 formats).
 * Returns the decoded token data if valid, null if invalid or expired.
 */
export async function verifyLogToken(
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
    if (bytes.length === 25 && bytes[0] === 0x03) {
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

    // Parse logId (6 bytes = 12 hex chars)
    const logIdBytes = bytes.slice(1, 7);
    const logId = Array.from(logIdBytes).map(b => b.toString(16).padStart(2, "0")).join("");

    // Parse permissions
    const permByte = bytes[7];
    const permissions: ("read" | "write")[] = [];
    if (permByte & PERM_READ) permissions.push("read");
    if (permByte & PERM_WRITE) permissions.push("write");

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
      logId,
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

    // Parse logId (8 bytes = 16 hex chars)
    const logIdBytes = bytes.slice(1, 9);
    const logId = Array.from(logIdBytes).map(b => b.toString(16).padStart(2, "0")).join("");

    // Parse permissions
    const permByte = bytes[9];
    const permissions: ("read" | "write")[] = [];
    if (permByte & PERM_READ) permissions.push("read");
    if (permByte & PERM_WRITE) permissions.push("write");

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
      logId,
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
    const token = JSON.parse(decoded) as LogCapabilityTokenV1;

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

    // Convert permissions from compact format
    const permissions = token.p.map((p) =>
      p === "r" ? "read" : "write"
    ) as ("read" | "write")[];

    return {
      logId: token.l,
      permissions,
      authorId: token.a,
      expiresAt: token.e,
    };
  } catch {
    return null;
  }
}

/**
 * Parse a token without verifying signature (for extracting logId to look up secret).
 * Returns null if token is malformed.
 */
export function parseLogToken(tokenString: string): { logId: string; version: 1 | 2 | 3 } | null {
  try {
    // V1 JSON format
    if (tokenString.startsWith("ey")) {
      const decoded = base64UrlDecode(tokenString);
      const token = JSON.parse(decoded) as LogCapabilityTokenV1;
      return { logId: token.l, version: 1 };
    }

    // Binary format
    const bytes = base64UrlDecodeBytes(tokenString);

    // V3 format
    if (bytes.length === 25 && bytes[0] === 0x03) {
      const logIdBytes = bytes.slice(1, 7);
      const logId = Array.from(logIdBytes).map(b => b.toString(16).padStart(2, "0")).join("");
      return { logId, version: 3 };
    }

    // V2 format
    if (bytes.length === 34 && bytes[0] === 0x02) {
      const logIdBytes = bytes.slice(1, 9);
      const logId = Array.from(logIdBytes).map(b => b.toString(16).padStart(2, "0")).join("");
      return { logId, version: 2 };
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
  payload: Omit<LogCapabilityTokenV1, "s">,
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

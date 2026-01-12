/**
 * Log Capability Token Utilities
 *
 * Creates and verifies self-contained capability tokens for log access.
 *
 * V2 Format (compact binary, ~46 chars):
 *   version(1) + logId(8) + permissions(1) + authorId(4) + expiresAt(4) + signature(16) = 34 bytes
 *   Base64url encoded = ~46 characters
 *
 * V1 Format (legacy JSON, ~200+ chars):
 *   JSON object with keys: l, g, p, a, e, s
 *   Base64url encoded JSON
 *
 * Recipients can use these tokens to access logs directly without a Federise account.
 */

import type { LogCapabilityTokenV1, LogCapabilityTokenV2 } from "../types.js";

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

/**
 * Create a compact V2 capability token for log access.
 * The token is a binary-packed structure, base64url encoded.
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

  // Ensure logId is 16 hex chars (8 bytes) - pad or truncate
  const logIdHex = params.logId.replace(/-/g, "").slice(0, 16).padEnd(16, "0");

  // Ensure authorId is 8 hex chars (4 bytes)
  const authorIdHex = params.authorId.replace(/-/g, "").slice(0, 8).padEnd(8, "0");

  // Build binary payload (without signature): version(1) + logId(8) + perm(1) + authorId(4) + expiry(4) = 18 bytes
  const payload = new Uint8Array(18);
  payload[0] = 0x02; // Version 2

  // LogId (8 bytes from hex)
  for (let i = 0; i < 8; i++) {
    payload[1 + i] = parseInt(logIdHex.slice(i * 2, i * 2 + 2), 16);
  }

  // Permissions (1 byte)
  payload[9] = permByte;

  // AuthorId (4 bytes from hex)
  for (let i = 0; i < 4; i++) {
    payload[10 + i] = parseInt(authorIdHex.slice(i * 2, i * 2 + 2), 16);
  }

  // ExpiresAt (4 bytes, big-endian uint32)
  const view = new DataView(payload.buffer);
  view.setUint32(14, expiresAt, false); // big-endian

  // Sign the payload
  const signature = await signBinary(payload, secret);

  // Truncate signature to 16 bytes
  const truncatedSig = signature.slice(0, 16);

  // Combine payload + truncated signature
  const token = new Uint8Array(34);
  token.set(payload, 0);
  token.set(truncatedSig, 18);

  // Encode as base64url
  const tokenString = base64UrlEncode(token);

  return { token: tokenString, expiresAt };
}

/**
 * Verify and decode a capability token (supports both V1 and V2 formats).
 * Returns the decoded token data if valid, null if invalid or expired.
 */
export async function verifyLogToken(
  tokenString: string,
  secret: string
): Promise<VerifiedToken | null> {
  try {
    // Detect format: V1 JSON starts with "ey" (base64 of "{"), V2 binary doesn't
    if (tokenString.startsWith("ey")) {
      return verifyV1Token(tokenString, secret);
    } else {
      return verifyV2Token(tokenString, secret);
    }
  } catch {
    return null;
  }
}

/**
 * Verify V2 (compact binary) token.
 */
async function verifyV2Token(
  tokenString: string,
  secret: string
): Promise<VerifiedToken | null> {
  try {
    const bytes = base64UrlDecodeBytes(tokenString);

    if (bytes.length !== 34) {
      return null;
    }

    // Check version
    if (bytes[0] !== 0x02) {
      return null;
    }

    // Extract payload (first 18 bytes)
    const payload = bytes.slice(0, 18);
    const providedSig = bytes.slice(18, 34);

    // Verify signature
    const expectedSig = await signBinary(payload, secret);
    const truncatedExpected = expectedSig.slice(0, 16);

    if (!timingSafeEqualBytes(providedSig, truncatedExpected)) {
      return null;
    }

    // Parse payload
    const logIdBytes = bytes.slice(1, 9);
    const logIdHex = Array.from(logIdBytes).map(b => b.toString(16).padStart(2, "0")).join("");

    const permByte = bytes[9];
    const permissions: ("read" | "write")[] = [];
    if (permByte & PERM_READ) permissions.push("read");
    if (permByte & PERM_WRITE) permissions.push("write");

    const authorIdBytes = bytes.slice(10, 14);
    const authorIdHex = Array.from(authorIdBytes).map(b => b.toString(16).padStart(2, "0")).join("");

    const view = new DataView(bytes.buffer, bytes.byteOffset);
    const expiresAt = view.getUint32(14, false); // big-endian

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (expiresAt < now) {
      return null;
    }

    return {
      logId: logIdHex,
      permissions,
      authorId: authorIdHex,
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
export function parseLogToken(tokenString: string): { logId: string; version: 1 | 2 } | null {
  try {
    // V1 JSON format
    if (tokenString.startsWith("ey")) {
      const decoded = base64UrlDecode(tokenString);
      const token = JSON.parse(decoded) as LogCapabilityTokenV1;
      return { logId: token.l, version: 1 };
    }

    // V2 binary format
    const bytes = base64UrlDecodeBytes(tokenString);
    if (bytes.length !== 34 || bytes[0] !== 0x02) {
      return null;
    }

    const logIdBytes = bytes.slice(1, 9);
    const logIdHex = Array.from(logIdBytes).map(b => b.toString(16).padStart(2, "0")).join("");
    return { logId: logIdHex, version: 2 };
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

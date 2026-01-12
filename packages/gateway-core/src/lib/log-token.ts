/**
 * Log Capability Token Utilities
 *
 * Creates and verifies self-contained capability tokens for log access.
 * Tokens include: logId, gatewayUrl, permissions, authorId, expiry, and HMAC signature.
 * Recipients can use these tokens to access logs directly without a Federise account.
 */

import type { LogCapabilityToken } from "../types.js";

export interface CreateTokenParams {
  logId: string;
  gatewayUrl: string;
  permissions: ("read" | "write")[];
  authorId: string;
  expiresInSeconds: number;
}

export interface VerifiedToken {
  logId: string;
  gatewayUrl: string;
  permissions: ("read" | "write")[];
  authorId: string;
  expiresAt: number;
}

/**
 * Create a capability token for log access.
 * The token is base64url-encoded JSON with an HMAC signature.
 */
export async function createLogToken(
  params: CreateTokenParams,
  secret: string
): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = Math.floor(Date.now() / 1000) + params.expiresInSeconds;

  // Convert permissions to compact format
  const permissions = params.permissions.map((p) =>
    p === "read" ? "r" : "w"
  ) as ("r" | "w")[];

  // Create token payload (without signature)
  const payload: Omit<LogCapabilityToken, "s"> = {
    l: params.logId,
    g: params.gatewayUrl,
    p: permissions,
    a: params.authorId,
    e: expiresAt,
  };

  // Sign the payload
  const signature = await signPayload(payload, secret);

  // Add signature to create complete token
  const token: LogCapabilityToken = {
    ...payload,
    s: signature,
  };

  // Encode as base64url
  const tokenString = base64UrlEncode(JSON.stringify(token));

  return { token: tokenString, expiresAt };
}

/**
 * Verify and decode a capability token.
 * Returns the decoded token data if valid, null if invalid or expired.
 */
export async function verifyLogToken(
  tokenString: string,
  secret: string
): Promise<VerifiedToken | null> {
  try {
    // Decode the token
    const decoded = base64UrlDecode(tokenString);
    const token = JSON.parse(decoded) as LogCapabilityToken;

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (token.e < now) {
      return null;
    }

    // Verify signature
    const { s: signature, ...payload } = token;
    const expectedSig = await signPayload(payload, secret);

    if (!timingSafeEqual(signature, expectedSig)) {
      return null;
    }

    // Convert permissions from compact format
    const permissions = token.p.map((p) =>
      p === "r" ? "read" : "write"
    ) as ("read" | "write")[];

    return {
      logId: token.l,
      gatewayUrl: token.g,
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
export function parseLogToken(tokenString: string): LogCapabilityToken | null {
  try {
    const decoded = base64UrlDecode(tokenString);
    return JSON.parse(decoded) as LogCapabilityToken;
  } catch {
    return null;
  }
}

/**
 * Sign a payload using HMAC-SHA256.
 */
async function signPayload(
  payload: Omit<LogCapabilityToken, "s">,
  secret: string
): Promise<string> {
  // Create deterministic string from payload
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
 * Encode string as base64url.
 */
function base64UrlEncode(data: string | Uint8Array): string {
  const str = typeof data === "string" ? data : String.fromCharCode(...data);
  const base64 = btoa(str);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Decode base64url to string.
 */
function base64UrlDecode(str: string): string {
  // Add padding if needed
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

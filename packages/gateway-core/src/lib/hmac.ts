/**
 * HMAC Signing Utilities for Presigned Download URLs
 *
 * Generates and verifies stateless signed URLs using HMAC-SHA256.
 * No KV lookups required - signature contains all verification data.
 */

export interface SignedUrlParams {
  namespace: string;
  key: string;
  expiresAt: number; // Unix timestamp in seconds
}

/**
 * Sign download URL parameters using HMAC-SHA256.
 * Returns a base64url-encoded signature.
 */
export async function signDownloadUrl(
  params: SignedUrlParams,
  secret: string
): Promise<string> {
  const payload = `${params.namespace}:${params.key}:${params.expiresAt}`;
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
    encoder.encode(payload)
  );

  return base64UrlEncode(new Uint8Array(signature));
}

/**
 * Verify a download URL signature.
 * Returns true if signature is valid, false otherwise.
 */
export async function verifyDownloadUrl(
  params: SignedUrlParams,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const expectedSig = await signDownloadUrl(params, secret);
    return timingSafeEqual(signature, expectedSig);
  } catch {
    return false;
  }
}

/**
 * Generate a complete signed download URL.
 */
export async function generateSignedDownloadUrl(
  baseUrl: string,
  namespace: string,
  key: string,
  secret: string,
  expiresInSeconds: number = 3600
): Promise<{ url: string; expiresAt: number }> {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;

  const sig = await signDownloadUrl({ namespace, key, expiresAt }, secret);

  const url = `${baseUrl}/blob/f/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}?sig=${sig}&exp=${expiresAt}`;

  return { url, expiresAt };
}

/**
 * Encode bytes as base64url (URL-safe base64 without padding).
 */
function base64UrlEncode(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Timing-safe string comparison to prevent timing attacks.
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

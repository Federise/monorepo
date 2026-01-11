/**
 * Token signing utilities for presigned URLs in filesystem mode.
 * Uses HMAC-SHA256 for secure token generation and validation.
 */

export interface PresignedUploadPayload {
  bucket: string;
  key: string;
  contentType: string;
  contentLength: number;
  expiresAt: number; // Unix timestamp in milliseconds
}

/**
 * Generate HMAC-SHA256 signature for a payload
 */
async function sign(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const data = encoder.encode(payload);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, data);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/**
 * Verify HMAC-SHA256 signature
 */
async function verify(payload: string, signature: string, secret: string): Promise<boolean> {
  const expectedSignature = await sign(payload, secret);
  return signature === expectedSignature;
}

/**
 * Create a signed presigned upload token
 */
export async function createPresignedUploadToken(
  payload: PresignedUploadPayload,
  secret: string
): Promise<string> {
  const payloadJson = JSON.stringify(payload);
  const signature = await sign(payloadJson, secret);

  // Combine payload and signature, base64 encode
  const token = btoa(JSON.stringify({
    payload: payloadJson,
    signature,
  }));

  return token;
}

/**
 * Validate and parse a presigned upload token
 * Returns the payload if valid, null if invalid or expired
 */
export async function validatePresignedUploadToken(
  token: string,
  secret: string
): Promise<PresignedUploadPayload | null> {
  try {
    // Decode the token
    const decoded = JSON.parse(atob(token));
    const { payload: payloadJson, signature } = decoded;

    // Verify signature
    const isValid = await verify(payloadJson, signature, secret);
    if (!isValid) {
      return null;
    }

    // Parse payload
    const payload: PresignedUploadPayload = JSON.parse(payloadJson);

    // Check expiration
    if (Date.now() > payload.expiresAt) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Generate a presigned upload URL for filesystem mode
 */
export async function generatePresignedUploadUrl(
  baseUrl: string,
  payload: PresignedUploadPayload,
  secret: string
): Promise<string> {
  const token = await createPresignedUploadToken(payload, secret);
  return `${baseUrl}/blob/presigned-put?token=${encodeURIComponent(token)}`;
}

/**
 * Generate a presigned download URL for filesystem mode
 */
export async function generatePresignedDownloadUrl(
  baseUrl: string,
  bucket: string,
  key: string,
  expiresIn: number,
  secret: string
): Promise<string> {
  const payload = {
    bucket,
    key,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  const payloadJson = JSON.stringify(payload);
  const signature = await sign(payloadJson, secret);
  const token = btoa(JSON.stringify({ payload: payloadJson, signature }));

  return `${baseUrl}/blob/presigned-get?token=${encodeURIComponent(token)}`;
}

/**
 * Validate a presigned download token
 */
export async function validatePresignedDownloadToken(
  token: string,
  secret: string
): Promise<{ bucket: string; key: string } | null> {
  try {
    const decoded = JSON.parse(atob(token));
    const { payload: payloadJson, signature } = decoded;

    const isValid = await verify(payloadJson, signature, secret);
    if (!isValid) {
      return null;
    }

    const payload = JSON.parse(payloadJson);

    if (Date.now() > payload.expiresAt) {
      return null;
    }

    return { bucket: payload.bucket, key: payload.key };
  } catch {
    return null;
  }
}

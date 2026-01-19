import { createGatewayClient, withAuth } from '../api/client';
import { getCredentials } from '../utils/vault';
import type { BlobMetadata, BlobVisibility } from './protocol';

/**
 * Get the gateway client and auth config.
 * Throws if no identity is configured.
 */
function getClient() {
  const { apiKey, gatewayUrl } = getCredentials();
  return { client: createGatewayClient(gatewayUrl), apiKey, url: gatewayUrl };
}

/**
 * Build a namespaced key for origin isolation.
 * Each origin gets its own namespace to prevent cross-origin data access.
 * Uses a hash of the origin to create a safe, consistent namespace.
 */
async function buildNamespace(origin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(origin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `origin_${hashHex}`;
}

/**
 * Helper to convert legacy isPublic to visibility.
 */
function resolveVisibility(visibility?: BlobVisibility, isPublic?: boolean): BlobVisibility {
  if (visibility) return visibility;
  if (isPublic === true) return 'public';
  return 'private';
}

/**
 * Get a presigned URL for direct upload to R2.
 * Returns null if presigned URLs are not available (R2 credentials not configured).
 */
export async function getPresignedUploadUrl(
  origin: string,
  key: string,
  contentType: string,
  size: number,
  visibility: BlobVisibility = 'private'
): Promise<{ uploadUrl: string; expiresAt: string } | null> {
  const { client, apiKey } = getClient();
  const namespace = await buildNamespace(origin);

  const { data, error } = await client.POST('/blob/presign-upload', {
    ...withAuth(apiKey),
    body: { namespace, key, contentType, size, visibility },
  });

  if (error) {
    // 503 means R2 credentials not configured - fall back to gateway upload
    if ('code' in error && error.code === 503) {
      console.log('[Blob] Presigned URLs not available, will use gateway upload');
      return null;
    }
    console.error('[Blob] Failed to get presigned URL:', error);
    throw new Error('Failed to get presigned URL');
  }

  return {
    uploadUrl: data!.uploadUrl,
    expiresAt: data!.expiresAt,
  };
}

/**
 * Get a presigned URL for direct upload and return with metadata.
 * Used by SDK for direct R2 uploads with progress tracking.
 * Returns null if presigned URLs are not available.
 */
export async function getUploadUrlWithMetadata(
  origin: string,
  key: string,
  contentType: string,
  size: number,
  visibility: BlobVisibility = 'private',
  isPublic?: boolean
): Promise<{ uploadUrl: string; metadata: BlobMetadata } | null> {
  const resolvedVisibility = resolveVisibility(visibility, isPublic);
  const presigned = await getPresignedUploadUrl(origin, key, contentType, size, resolvedVisibility);

  if (!presigned) {
    return null;
  }

  const namespace = await buildNamespace(origin);
  const metadata: BlobMetadata = {
    key,
    namespace,
    size,
    contentType,
    uploadedAt: new Date().toISOString(),
    visibility: resolvedVisibility,
  };

  return {
    uploadUrl: presigned.uploadUrl,
    metadata,
  };
}

/**
 * Upload a blob directly to R2 using presigned URL, with gateway fallback.
 */
export async function uploadBlob(
  origin: string,
  key: string,
  contentType: string,
  data: ArrayBuffer,
  visibility: BlobVisibility = 'private',
  isPublic?: boolean
): Promise<BlobMetadata> {
  const resolvedVisibility = resolveVisibility(visibility, isPublic);
  const size = data.byteLength;

  // Try to get presigned URL for direct R2 upload
  const presigned = await getPresignedUploadUrl(origin, key, contentType, size, resolvedVisibility);

  if (presigned) {
    // Direct upload to R2
    const response = await fetch(presigned.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': size.toString(),
      },
      body: data,
    });

    if (!response.ok) {
      console.error('[Blob] Direct R2 upload failed:', response.status);
      throw new Error('Failed to upload blob to R2');
    }

    // Return metadata (already stored in KV by presign endpoint)
    const namespace = await buildNamespace(origin);
    return {
      key,
      namespace,
      size,
      contentType,
      uploadedAt: new Date().toISOString(),
      visibility: resolvedVisibility,
    };
  }

  // Fallback: Upload through gateway
  const { apiKey, url } = getClient();
  const namespace = await buildNamespace(origin);

  const response = await fetch(`${url}/blob/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `ApiKey ${apiKey}`,
      'Content-Type': contentType,
      'X-Blob-Namespace': namespace,
      'X-Blob-Key': key,
      'X-Blob-Visibility': resolvedVisibility,
    },
    body: data,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Upload failed' })) as { message?: string };
    console.error('[Blob] Failed to upload:', error);
    throw new Error(error.message || 'Failed to upload blob');
  }

  const result = await response.json() as { metadata: BlobMetadata };
  return result.metadata;
}

/**
 * Get a download URL for a blob.
 */
export async function getBlob(
  origin: string,
  key: string
): Promise<{ url: string; metadata: BlobMetadata; expiresAt?: string }> {
  const { client, apiKey } = getClient();
  const namespace = await buildNamespace(origin);

  const { data, error } = await client.POST('/blob/get', {
    ...withAuth(apiKey),
    body: { namespace, key },
  });

  if (error) {
    console.error('[Blob] Failed to get blob:', error);
    throw new Error('Failed to get blob');
  }

  if (!data?.url || !data?.metadata) {
    throw new Error('Invalid blob response');
  }

  return {
    url: data.url,
    metadata: data.metadata as BlobMetadata,
    expiresAt: data.expiresAt,
  };
}

/**
 * Delete a blob.
 */
export async function deleteBlob(origin: string, key: string): Promise<void> {
  const { client, apiKey } = getClient();
  const namespace = await buildNamespace(origin);

  const { error } = await client.POST('/blob/delete', {
    ...withAuth(apiKey),
    body: { namespace, key },
  });

  if (error) {
    console.error('[Blob] Failed to delete blob:', error);
    throw new Error('Failed to delete blob');
  }
}

/**
 * List all blobs for the given origin.
 */
export async function listBlobs(origin: string): Promise<BlobMetadata[]> {
  const { client, apiKey } = getClient();
  const namespace = await buildNamespace(origin);

  const { data, error } = await client.POST('/blob/list', {
    ...withAuth(apiKey),
    body: { namespace },
  });

  if (error) {
    console.error('[Blob] Failed to list blobs:', error);
    throw new Error('Failed to list blobs');
  }

  return (data?.blobs as BlobMetadata[]) ?? [];
}

/**
 * Change the visibility of an existing blob.
 */
export async function setBlobVisibility(
  origin: string,
  key: string,
  visibility: BlobVisibility
): Promise<BlobMetadata> {
  const { client, apiKey } = getClient();
  const namespace = await buildNamespace(origin);

  const { data, error } = await client.POST('/blob/visibility', {
    ...withAuth(apiKey),
    body: { namespace, key, visibility },
  });

  if (error) {
    console.error('[Blob] Failed to set visibility:', error);
    throw new Error('Failed to set blob visibility');
  }

  return data?.metadata as BlobMetadata;
}

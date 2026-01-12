/**
 * Presigner Adapter Interface
 *
 * Abstracts presigned URL generation for blob uploads/downloads.
 * Implementations use S3-compatible presigning (works with R2, MinIO, S3, etc.)
 */

export interface PresignUploadOptions {
  contentType: string;
  contentLength: number;
  expiresIn: number; // seconds
}

export interface PresignDownloadOptions {
  expiresIn: number; // seconds
}

export interface IPresigner {
  /**
   * Generate a presigned URL for uploading a blob
   * @param bucket - The bucket name
   * @param key - The object key
   * @param options - Upload options including content type and expiration
   * @returns The presigned upload URL
   */
  getSignedUploadUrl(
    bucket: string,
    key: string,
    options: PresignUploadOptions
  ): Promise<string>;

  /**
   * Generate a presigned URL for downloading a blob
   * @param bucket - The bucket name
   * @param key - The object key
   * @param options - Download options including expiration
   * @returns The presigned download URL
   */
  getSignedDownloadUrl(
    bucket: string,
    key: string,
    options: PresignDownloadOptions
  ): Promise<string>;

  /**
   * Get a direct public URL (no signing). Used with custom domains.
   * Optional - returns null if not supported/configured.
   */
  getPublicUrl?(bucket: string, key: string): string | null;
}

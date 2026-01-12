/**
 * Blob Store Adapter Interface
 *
 * Abstracts blob/object storage operations for the Federise Gateway.
 * Implementations can use Cloudflare R2, S3/MinIO, local filesystem, etc.
 */

export interface BlobObject {
  body: ReadableStream<Uint8Array>;
  size: number;
  contentType?: string;
  etag?: string;
}

export interface BlobGetOptions {
  range?: {
    offset: number;
    length?: number;
  };
}

export interface BlobPutOptions {
  httpMetadata?: {
    contentType?: string;
  };
}

export interface BlobListObject {
  key: string;
  size: number;
}

export interface BlobListResult {
  objects: BlobListObject[];
  truncated: boolean;
  cursor?: string;
}

export interface BlobListOptions {
  prefix?: string;
  limit?: number;
  cursor?: string;
}

export interface IBlobStore {
  /**
   * Get a blob by key
   * @param key The blob key
   * @param options Optional range request parameters
   * @returns The blob object with body stream, or null if not found
   */
  get(key: string, options?: BlobGetOptions): Promise<BlobObject | null>;

  /**
   * Store a blob
   */
  put(
    key: string,
    body: ArrayBuffer | ReadableStream<Uint8Array>,
    options?: BlobPutOptions
  ): Promise<void>;

  /**
   * Delete a blob
   */
  delete(key: string): Promise<void>;

  /**
   * List blobs with optional prefix filter
   */
  list(options?: BlobListOptions): Promise<BlobListResult>;
}

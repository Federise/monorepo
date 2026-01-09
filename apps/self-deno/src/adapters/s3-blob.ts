import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import type {
  IBlobStore,
  BlobObject,
  BlobPutOptions,
  BlobListOptions,
  BlobListResult,
} from "@federise/gateway-core";

export interface S3BlobStoreConfig {
  endpoint: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  forcePathStyle?: boolean;
}

/**
 * S3-compatible Blob Store implementation for Deno
 *
 * Works with MinIO, AWS S3, Cloudflare R2 (via S3 API), and other
 * S3-compatible object storage services.
 */
export class S3BlobStore implements IBlobStore {
  private client: S3Client;
  private bucket: string;

  constructor(config: S3BlobStoreConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region || "us-east-1",
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle ?? true, // Required for MinIO
    });
  }

  async get(key: string): Promise<BlobObject | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );

      if (!response.Body) {
        return null;
      }

      // Convert SDK stream to web ReadableStream
      const webStream = response.Body.transformToWebStream();

      return {
        body: webStream,
        size: response.ContentLength ?? 0,
        contentType: response.ContentType,
      };
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.name === "NoSuchKey" || error.name === "NotFound")
      ) {
        return null;
      }
      throw error;
    }
  }

  async put(
    key: string,
    body: ArrayBuffer | ReadableStream<Uint8Array>,
    options?: BlobPutOptions
  ): Promise<void> {
    // Convert to Uint8Array for S3 SDK
    let bodyContent: Uint8Array;

    if (body instanceof ArrayBuffer) {
      bodyContent = new Uint8Array(body);
    } else {
      // ReadableStream - collect all chunks
      const chunks: Uint8Array[] = [];
      const reader = body.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }

      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }
      bodyContent = result;
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bodyContent,
        ContentType: options?.httpMetadata?.contentType,
      })
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
  }

  async list(options?: BlobListOptions): Promise<BlobListResult> {
    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: options?.prefix,
        MaxKeys: options?.limit,
        ContinuationToken: options?.cursor,
      })
    );

    const objects = (response.Contents ?? []).map((obj) => ({
      key: obj.Key ?? "",
      size: obj.Size ?? 0,
    }));

    return {
      objects,
      truncated: response.IsTruncated ?? false,
      cursor: response.NextContinuationToken,
    };
  }

  /**
   * Get the S3 client for use with presigning
   */
  getClient(): S3Client {
    return this.client;
  }

  /**
   * Get the bucket name
   */
  getBucket(): string {
    return this.bucket;
  }
}

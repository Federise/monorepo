import type {
  IBlobStore,
  BlobObject,
  BlobPutOptions,
  BlobListOptions,
  BlobListResult,
} from "@federise/gateway-core";

/**
 * Cloudflare R2 adapter implementing IBlobStore interface
 */
export class CloudflareR2Adapter implements IBlobStore {
  constructor(private bucket: R2Bucket) {}

  async get(key: string): Promise<BlobObject | null> {
    const object = await this.bucket.get(key);
    if (!object) return null;

    return {
      body: object.body,
      size: object.size,
      contentType: object.httpMetadata?.contentType,
    };
  }

  async put(
    key: string,
    body: ArrayBuffer | ReadableStream<Uint8Array>,
    options?: BlobPutOptions
  ): Promise<void> {
    await this.bucket.put(key, body, {
      httpMetadata: options?.httpMetadata,
    });
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  async list(options?: BlobListOptions): Promise<BlobListResult> {
    const result = await this.bucket.list({
      prefix: options?.prefix,
      limit: options?.limit,
      cursor: options?.cursor,
    });

    return {
      objects: result.objects.map((o) => ({
        key: o.key,
        size: o.size,
      })),
      truncated: result.truncated,
      cursor: result.cursor || undefined,
    };
  }
}

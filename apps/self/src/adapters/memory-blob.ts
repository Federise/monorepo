import type {
  IBlobStore,
  BlobObject,
  BlobPutOptions,
  BlobListOptions,
  BlobListResult,
} from "@federise/gateway-core";

interface StoredBlob {
  data: ArrayBuffer;
  contentType?: string;
}

/**
 * In-memory Blob Store implementation for testing
 */
export class MemoryBlobStore implements IBlobStore {
  private store: Map<string, StoredBlob> = new Map();

  async get(key: string): Promise<BlobObject | null> {
    const blob = this.store.get(key);
    if (!blob) return null;

    // Create a ReadableStream from the stored data
    const data = blob.data;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(data));
        controller.close();
      },
    });

    return {
      body: stream,
      size: data.byteLength,
      contentType: blob.contentType,
    };
  }

  async put(
    key: string,
    body: ArrayBuffer | ReadableStream<Uint8Array>,
    options?: BlobPutOptions
  ): Promise<void> {
    let data: ArrayBuffer;

    if (body instanceof ArrayBuffer) {
      data = body;
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
      data = result.buffer;
    }

    this.store.set(key, {
      data,
      contentType: options?.httpMetadata?.contentType,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(options?: BlobListOptions): Promise<BlobListResult> {
    const prefix = options?.prefix ?? "";
    const limit = options?.limit ?? 1000;

    const allKeys = Array.from(this.store.entries())
      .filter(([key]) => key.startsWith(prefix))
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, limit + 1);

    const hasMore = allKeys.length > limit;
    const objects = allKeys.slice(0, limit).map(([key, blob]) => ({
      key,
      size: blob.data.byteLength,
    }));

    return {
      objects,
      truncated: hasMore,
      cursor: hasMore ? objects[objects.length - 1]?.key : undefined,
    };
  }

  /**
   * Clear all data (useful for tests)
   */
  clear(): void {
    this.store.clear();
  }
}

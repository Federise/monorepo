import type { IKVStore, KVListOptions, KVListResult } from "@federise/gateway-core";

/**
 * Cloudflare KV adapter implementing IKVStore interface
 */
export class CloudflareKVAdapter implements IKVStore {
  constructor(private kv: KVNamespace) {}

  async get(key: string): Promise<string | null> {
    return this.kv.get(key);
  }

  async put(key: string, value: string): Promise<void> {
    await this.kv.put(key, value);
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
  }

  async list(options?: KVListOptions): Promise<KVListResult> {
    const result = await this.kv.list({
      prefix: options?.prefix,
      limit: options?.limit,
      cursor: options?.cursor,
    });

    return {
      keys: result.keys.map((k) => ({ name: k.name })),
      cursor: result.cursor || undefined,
      list_complete: result.list_complete,
    };
  }
}

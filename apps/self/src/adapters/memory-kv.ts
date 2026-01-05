import type { IKVStore, KVListOptions, KVListResult } from "@federise/gateway-core";

/**
 * In-memory KV Store implementation for testing
 */
export class MemoryKVStore implements IKVStore {
  private store: Map<string, string> = new Map();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(options?: KVListOptions): Promise<KVListResult> {
    const prefix = options?.prefix ?? "";
    const limit = options?.limit ?? 1000;

    const allKeys = Array.from(this.store.keys())
      .filter((key) => key.startsWith(prefix))
      .sort();

    const hasMore = allKeys.length > limit;
    const keys = allKeys.slice(0, limit).map((name) => ({ name }));

    return {
      keys,
      list_complete: !hasMore,
      cursor: hasMore ? keys[keys.length - 1]?.name : undefined,
    };
  }

  /**
   * Clear all data (useful for tests)
   */
  clear(): void {
    this.store.clear();
  }
}

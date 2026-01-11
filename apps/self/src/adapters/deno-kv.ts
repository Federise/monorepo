import type {
  IKVStore,
  KVListOptions,
  KVListResult,
} from "@federise/gateway-core";

/**
 * Deno KV-based storage adapter implementing IKVStore interface
 *
 * Uses Deno's built-in KV store which persists to SQLite under the hood.
 * This adapter is designed for use with `deno compile` to create a
 * zero-dependency single binary.
 */
export class DenoKVStore implements IKVStore {
  private kv: Deno.Kv | null = null;
  private kvPath?: string;

  /**
   * Create a new Deno KV store
   * @param path - Optional path for the KV database file. If not provided, uses default location.
   */
  constructor(path?: string) {
    this.kvPath = path;
  }

  /**
   * Initialize the KV store connection (lazy initialization)
   */
  private async getKv(): Promise<Deno.Kv> {
    if (!this.kv) {
      this.kv = await Deno.openKv(this.kvPath);
    }
    return this.kv;
  }

  async get(key: string): Promise<string | null> {
    const kv = await this.getKv();
    const result = await kv.get<string>(["kv", key]);
    return result.value ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    const kv = await this.getKv();
    await kv.set(["kv", key], value);
  }

  async delete(key: string): Promise<void> {
    const kv = await this.getKv();
    await kv.delete(["kv", key]);
  }

  async list(options?: KVListOptions): Promise<KVListResult> {
    const kv = await this.getKv();
    const prefix = options?.prefix ?? "";
    const limit = options?.limit ?? 1000;

    // List all keys under "kv" namespace and filter by prefix
    const selector: Deno.KvListSelector = { prefix: ["kv"] };

    const keys: { name: string }[] = [];
    let count = 0;
    let hasMore = false;
    let lastKey: string | undefined;

    // Iterate through entries
    const iter = kv.list<string>(selector);

    for await (const entry of iter) {
      // Extract the actual key from the Deno KV key tuple ["kv", "actual:key"]
      const keyParts = entry.key;
      if (keyParts.length >= 2 && keyParts[0] === "kv") {
        const actualKey = String(keyParts[1]);

        // Only include keys that match the prefix
        if (prefix && !actualKey.startsWith(prefix)) {
          continue;
        }

        // Handle cursor-based pagination
        if (options?.cursor && actualKey <= options.cursor) {
          continue;
        }

        // Check if we've hit the limit
        if (count >= limit) {
          hasMore = true;
          break;
        }

        keys.push({ name: actualKey });
        lastKey = actualKey;
        count++;
      }
    }

    return {
      keys,
      list_complete: !hasMore,
      cursor: hasMore ? lastKey : undefined,
    };
  }

  /**
   * Close the KV store connection
   */
  close(): void {
    if (this.kv) {
      this.kv.close();
      this.kv = null;
    }
  }
}

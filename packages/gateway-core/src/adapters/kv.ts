/**
 * KV Store Adapter Interface
 *
 * Abstracts key-value storage operations for the Federise Gateway.
 * Implementations can use Cloudflare KV, SQLite, Redis, etc.
 */

export interface KVListKey {
  name: string;
}

export interface KVListResult {
  keys: KVListKey[];
  cursor?: string;
  list_complete: boolean;
}

export interface KVListOptions {
  prefix?: string;
  limit?: number;
  cursor?: string;
}

export interface IKVStore {
  /**
   * Get a value by key
   * @returns The value as a string, or null if not found
   */
  get(key: string): Promise<string | null>;

  /**
   * Set a value by key
   */
  put(key: string, value: string): Promise<void>;

  /**
   * Delete a key
   */
  delete(key: string): Promise<void>;

  /**
   * List keys with optional prefix filter
   */
  list(options?: KVListOptions): Promise<KVListResult>;
}

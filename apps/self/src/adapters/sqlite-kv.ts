import Database from "better-sqlite3";
import type { IKVStore, KVListOptions, KVListResult } from "@federise/gateway-core";

/**
 * SQLite-based KV Store implementation
 *
 * Uses a simple key-value table for storage. Supports prefix-based listing
 * compatible with Cloudflare KV's list() API.
 */
export class SQLiteKVStore implements IKVStore {
  private db: Database.Database;

  constructor(dbPath: string = "./data/kv.db") {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async get(key: string): Promise<string | null> {
    const stmt = this.db.prepare("SELECT value FROM kv WHERE key = ?");
    const row = stmt.get(key) as { value: string } | undefined;
    return row ? row.value : null;
  }

  async put(key: string, value: string): Promise<void> {
    const stmt = this.db.prepare(
      "INSERT OR REPLACE INTO kv (key, value, created_at) VALUES (?, ?, datetime('now'))"
    );
    stmt.run(key, value);
  }

  async delete(key: string): Promise<void> {
    const stmt = this.db.prepare("DELETE FROM kv WHERE key = ?");
    stmt.run(key);
  }

  async list(options?: KVListOptions): Promise<KVListResult> {
    const prefix = options?.prefix ?? "";
    const limit = options?.limit ?? 1000;

    // SQLite LIKE uses % as wildcard, escape any % or _ in prefix
    const escapedPrefix = prefix.replace(/[%_]/g, "\\$&");
    const pattern = `${escapedPrefix}%`;

    const stmt = this.db.prepare(
      "SELECT key FROM kv WHERE key LIKE ? ESCAPE '\\' ORDER BY key LIMIT ?"
    );
    const rows = stmt.all(pattern, limit + 1) as { key: string }[];

    const hasMore = rows.length > limit;
    const keys = rows.slice(0, limit).map((r) => ({ name: r.key }));

    return {
      keys,
      list_complete: !hasMore,
      cursor: hasMore ? keys[keys.length - 1]?.name : undefined,
    };
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}

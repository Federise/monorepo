import { DurableObject } from "cloudflare:workers";
import type {
  LogStoreMetadata,
  LogStoreEvent,
  LogAppendOptions,
  LogReadOptions,
  LogStoreReadResult,
} from "@federise/gateway-core";

/**
 * Durable Object for storing log events atomically.
 * Each log instance stores:
 * - "meta" - Log metadata (JSON)
 * - "seq" - Current sequence number
 * - "event:{paddedSeq}" - Individual events (JSON)
 */
export class LogStorageDO extends DurableObject {
  /**
   * Create a new log with metadata
   */
  async create(
    logId: string,
    name: string,
    ownerNamespace: string,
    secret: string
  ): Promise<LogStoreMetadata> {
    const metadata: LogStoreMetadata = {
      logId,
      name,
      ownerNamespace,
      createdAt: new Date().toISOString(),
      secret,
    };

    // Atomically write metadata and initial sequence
    await this.ctx.storage.put({
      meta: JSON.stringify(metadata),
      seq: 0,
    });

    return metadata;
  }

  /**
   * Get log metadata
   */
  async getMetadata(): Promise<LogStoreMetadata | null> {
    const metaStr = await this.ctx.storage.get<string>("meta");
    if (!metaStr) {
      return null;
    }
    return JSON.parse(metaStr);
  }

  /**
   * Append an event atomically
   * The sequence number is incremented atomically.
   */
  async append(options: LogAppendOptions): Promise<LogStoreEvent> {
    // Get current sequence
    const currentSeq = (await this.ctx.storage.get<number>("seq")) ?? 0;
    const newSeq = currentSeq + 1;

    // Create event
    const event: LogStoreEvent = {
      id: crypto.randomUUID(),
      seq: newSeq,
      authorId: options.authorId,
      content: options.content,
      createdAt: new Date().toISOString(),
    };

    // Atomically write new sequence and event
    const paddedSeq = String(newSeq).padStart(10, "0");
    await this.ctx.storage.put({
      seq: newSeq,
      [`event:${paddedSeq}`]: JSON.stringify(event),
    });

    return event;
  }

  /**
   * Read events from the log
   */
  async read(options?: LogReadOptions): Promise<LogStoreReadResult> {
    const afterSeq = options?.afterSeq ?? 0;
    const limit = options?.limit ?? 50;

    // List all event keys with prefix
    const entries = await this.ctx.storage.list<string>({
      prefix: "event:",
      limit: limit + afterSeq + 1, // Ensure we get enough entries
    });

    const events: LogStoreEvent[] = [];
    let hasMore = false;

    for (const [key, value] of entries) {
      // Extract sequence from key (event:0000000001 -> 1)
      const seqStr = key.replace("event:", "");
      const seq = parseInt(seqStr, 10);

      if (seq > afterSeq) {
        if (events.length >= limit) {
          hasMore = true;
          break;
        }
        events.push(JSON.parse(value));
      }
    }

    return { events, hasMore };
  }

  /**
   * Delete all data in this log
   */
  async deleteAll(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}

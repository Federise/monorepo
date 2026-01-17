import { DurableObject } from "cloudflare:workers";
import type {
  ChannelStoreMetadata,
  ChannelStoreEvent,
  ChannelAppendOptions,
  ChannelReadOptions,
  ChannelStoreReadResult,
  ChannelDeleteEventOptions,
} from "@federise/gateway-core";

/**
 * Durable Object for storing channel events atomically.
 * Each channel instance stores:
 * - "meta" - Channel metadata (JSON)
 * - "seq" - Current sequence number
 * - "event:{paddedSeq}" - Individual events (JSON)
 */
export class ChannelStorageDO extends DurableObject {
  /**
   * Create a new channel with metadata
   */
  async create(
    channelId: string,
    name: string,
    ownerNamespace: string,
    secret: string
  ): Promise<ChannelStoreMetadata> {
    const metadata: ChannelStoreMetadata = {
      channelId,
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
   * Get channel metadata
   */
  async getMetadata(): Promise<ChannelStoreMetadata | null> {
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
  async append(options: ChannelAppendOptions): Promise<ChannelStoreEvent> {
    // Get current sequence
    const currentSeq = (await this.ctx.storage.get<number>("seq")) ?? 0;
    const newSeq = currentSeq + 1;

    // Create event (type defaults to 'message')
    const event: ChannelStoreEvent = {
      id: crypto.randomUUID(),
      seq: newSeq,
      authorId: options.authorId,
      type: "message",
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
   * Get a single event by sequence number
   */
  async getEvent(seq: number): Promise<ChannelStoreEvent | null> {
    const paddedSeq = String(seq).padStart(10, "0");
    const eventStr = await this.ctx.storage.get<string>(`event:${paddedSeq}`);
    if (!eventStr) {
      return null;
    }
    return JSON.parse(eventStr);
  }

  /**
   * Append a deletion marker event to soft-delete a message
   */
  async appendDeletion(options: ChannelDeleteEventOptions): Promise<ChannelStoreEvent> {
    // Get current sequence
    const currentSeq = (await this.ctx.storage.get<number>("seq")) ?? 0;
    const newSeq = currentSeq + 1;

    // Create deletion marker event
    const event: ChannelStoreEvent = {
      id: crypto.randomUUID(),
      seq: newSeq,
      authorId: options.authorId,
      type: "deletion",
      targetSeq: options.targetSeq,
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
   * Read events from the channel
   * Handles soft-delete filtering:
   * - Builds a set of deleted seqs from deletion markers
   * - Never returns deletion markers to clients
   * - If includeDeleted is false: filters out deleted messages
   * - If includeDeleted is true: marks deleted messages with deleted: true
   */
  async read(options?: ChannelReadOptions): Promise<ChannelStoreReadResult> {
    const afterSeq = options?.afterSeq ?? 0;
    const limit = options?.limit ?? 50;
    const includeDeleted = options?.includeDeleted ?? false;

    // We need to read more than limit to account for deletion markers and deleted events
    // This is a tradeoff - we might need multiple reads for heavily deleted channels
    const readLimit = limit * 3; // Read more to ensure we have enough after filtering

    // List all event keys with prefix
    const entries = await this.ctx.storage.list<string>({
      prefix: "event:",
      limit: readLimit + afterSeq + 1,
    });

    // First pass: collect all events and build deletion set
    const allEvents: ChannelStoreEvent[] = [];
    const deletedSeqs = new Set<number>();

    for (const [key, value] of entries) {
      const seqStr = key.replace("event:", "");
      const seq = parseInt(seqStr, 10);

      if (seq > afterSeq) {
        const event: ChannelStoreEvent = JSON.parse(value);
        allEvents.push(event);

        // Track deleted sequences
        if (event.type === "deletion" && event.targetSeq !== undefined) {
          deletedSeqs.add(event.targetSeq);
        }
      }
    }

    // Second pass: filter and mark events
    const filteredEvents: ChannelStoreEvent[] = [];
    let hasMore = false;

    for (const event of allEvents) {
      // Never return deletion markers to clients
      if (event.type === "deletion") {
        continue;
      }

      const isDeleted = deletedSeqs.has(event.seq);

      if (isDeleted && !includeDeleted) {
        // Skip deleted events when includeDeleted is false
        continue;
      }

      if (filteredEvents.length >= limit) {
        hasMore = true;
        break;
      }

      // Mark deleted events if including them
      if (isDeleted) {
        filteredEvents.push({ ...event, deleted: true });
      } else {
        filteredEvents.push(event);
      }
    }

    return { events: filteredEvents, hasMore };
  }

  /**
   * Delete all data in this channel
   */
  async deleteAll(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}

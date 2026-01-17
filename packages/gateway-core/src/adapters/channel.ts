/**
 * Channel Store Adapter Interface
 *
 * Abstracts channel storage operations for the Federise Gateway.
 * Implementations can use Durable Objects, KV, SQLite, etc.
 */

import type { ChannelEventType } from "../types.js";

/**
 * Channel metadata stored with each channel (internal adapter type)
 */
export interface ChannelStoreMetadata {
  channelId: string;
  name: string;
  ownerNamespace: string;
  createdAt: string;
  secret: string;
}

/**
 * Individual event in a channel (internal adapter type)
 */
export interface ChannelStoreEvent {
  id: string;
  seq: number;
  authorId: string;
  type?: ChannelEventType; // 'message' (default) or 'deletion'
  content?: string; // Optional for deletion events
  targetSeq?: number; // Only for deletion events - the seq being deleted
  deleted?: boolean; // Flag when returning soft-deleted events
  createdAt: string;
}

/**
 * Options for appending to a channel
 */
export interface ChannelAppendOptions {
  authorId: string;
  content: string;
}

/**
 * Options for reading from a channel
 */
export interface ChannelReadOptions {
  afterSeq?: number;
  limit?: number;
  includeDeleted?: boolean; // Include soft-deleted events (with deleted: true flag)
}

/**
 * Options for soft-deleting an event
 */
export interface ChannelDeleteEventOptions {
  authorId: string; // Author creating the deletion marker
  targetSeq: number; // The seq of the event to soft-delete
}

/**
 * Result of reading events from a channel
 */
export interface ChannelStoreReadResult {
  events: ChannelStoreEvent[];
  hasMore: boolean;
}

/**
 * Channel Store Interface
 *
 * Provides atomic operations for channel storage.
 * Each channel is identified by its channelId and contains ordered events.
 */
export interface IChannelStore {
  /**
   * Create a new channel
   * @param channelId - Unique identifier for the channel
   * @param name - Human-readable name for the channel
   * @param ownerNamespace - Namespace that owns this channel
   * @param secret - Secret key for token signing
   * @returns The created channel metadata
   */
  create(
    channelId: string,
    name: string,
    ownerNamespace: string,
    secret: string
  ): Promise<ChannelStoreMetadata>;

  /**
   * Get channel metadata
   * @param channelId - The channel identifier
   * @returns Channel metadata or null if not found
   */
  getMetadata(channelId: string): Promise<ChannelStoreMetadata | null>;

  /**
   * Append an event to a channel atomically
   * The sequence number is assigned atomically to prevent race conditions.
   * @param channelId - The channel identifier
   * @param options - Event data (authorId, content)
   * @returns The created event with assigned sequence number
   */
  append(channelId: string, options: ChannelAppendOptions): Promise<ChannelStoreEvent>;

  /**
   * Read events from a channel
   * @param channelId - The channel identifier
   * @param options - Optional filters (afterSeq, limit, includeDeleted)
   * @returns Events and pagination info
   */
  read(channelId: string, options?: ChannelReadOptions): Promise<ChannelStoreReadResult>;

  /**
   * Get a single event by sequence number
   * @param channelId - The channel identifier
   * @param seq - The sequence number of the event
   * @returns The event or null if not found
   */
  getEvent(channelId: string, seq: number): Promise<ChannelStoreEvent | null>;

  /**
   * Append a deletion marker event to soft-delete a message
   * @param channelId - The channel identifier
   * @param options - Deletion options (authorId, targetSeq)
   * @returns The created deletion event
   */
  appendDeletion(channelId: string, options: ChannelDeleteEventOptions): Promise<ChannelStoreEvent>;

  /**
   * Delete a channel and all its events
   * @param channelId - The channel identifier
   */
  delete(channelId: string): Promise<void>;
}

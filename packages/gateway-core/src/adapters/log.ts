/**
 * Log Store Adapter Interface
 *
 * Abstracts log storage operations for the Federise Gateway.
 * Implementations can use Durable Objects, KV, SQLite, etc.
 */

/**
 * Log metadata stored with each log (internal adapter type)
 */
export interface LogStoreMetadata {
  logId: string;
  name: string;
  ownerNamespace: string;
  createdAt: string;
  secret: string;
}

/**
 * Individual event in a log (internal adapter type)
 */
export interface LogStoreEvent {
  id: string;
  seq: number;
  authorId: string;
  content: string;
  createdAt: string;
}

/**
 * Options for appending to a log
 */
export interface LogAppendOptions {
  authorId: string;
  content: string;
}

/**
 * Options for reading from a log
 */
export interface LogReadOptions {
  afterSeq?: number;
  limit?: number;
}

/**
 * Result of reading events from a log
 */
export interface LogStoreReadResult {
  events: LogStoreEvent[];
  hasMore: boolean;
}

/**
 * Log Store Interface
 *
 * Provides atomic operations for log storage.
 * Each log is identified by its logId and contains ordered events.
 */
export interface ILogStore {
  /**
   * Create a new log
   * @param logId - Unique identifier for the log
   * @param name - Human-readable name for the log
   * @param ownerNamespace - Namespace that owns this log
   * @param secret - Secret key for token signing
   * @returns The created log metadata
   */
  create(
    logId: string,
    name: string,
    ownerNamespace: string,
    secret: string
  ): Promise<LogStoreMetadata>;

  /**
   * Get log metadata
   * @param logId - The log identifier
   * @returns Log metadata or null if not found
   */
  getMetadata(logId: string): Promise<LogStoreMetadata | null>;

  /**
   * Append an event to a log atomically
   * The sequence number is assigned atomically to prevent race conditions.
   * @param logId - The log identifier
   * @param options - Event data (authorId, content)
   * @returns The created event with assigned sequence number
   */
  append(logId: string, options: LogAppendOptions): Promise<LogStoreEvent>;

  /**
   * Read events from a log
   * @param logId - The log identifier
   * @param options - Optional filters (afterSeq, limit)
   * @returns Events and pagination info
   */
  read(logId: string, options?: LogReadOptions): Promise<LogStoreReadResult>;

  /**
   * Delete a log and all its events
   * @param logId - The log identifier
   */
  delete(logId: string): Promise<void>;
}

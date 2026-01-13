import type {
  ILogStore,
  LogStoreMetadata,
  LogStoreEvent,
  LogAppendOptions,
  LogReadOptions,
  LogStoreReadResult,
} from "@federise/gateway-core";
import type { LogStorageDO } from "../durable-objects/log-storage.js";

/**
 * Cloudflare Durable Objects adapter for log storage.
 * Routes requests to the appropriate DO instance based on logId.
 */
export class CloudflareLogDOAdapter implements ILogStore {
  constructor(private readonly namespace: DurableObjectNamespace<LogStorageDO>) {}

  /**
   * Get the DO stub for a specific log
   */
  private getStub(logId: string): DurableObjectStub<LogStorageDO> {
    const id = this.namespace.idFromName(logId);
    return this.namespace.get(id);
  }

  async create(
    logId: string,
    name: string,
    ownerNamespace: string,
    secret: string
  ): Promise<LogStoreMetadata> {
    const stub = this.getStub(logId);
    return await stub.create(logId, name, ownerNamespace, secret);
  }

  async getMetadata(logId: string): Promise<LogStoreMetadata | null> {
    const stub = this.getStub(logId);
    return await stub.getMetadata();
  }

  async append(logId: string, options: LogAppendOptions): Promise<LogStoreEvent> {
    const stub = this.getStub(logId);
    return await stub.append(options);
  }

  async read(logId: string, options?: LogReadOptions): Promise<LogStoreReadResult> {
    const stub = this.getStub(logId);
    return await stub.read(options);
  }

  async delete(logId: string): Promise<void> {
    const stub = this.getStub(logId);
    await stub.deleteAll();
  }
}

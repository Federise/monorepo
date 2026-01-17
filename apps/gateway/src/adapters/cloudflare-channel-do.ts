import type {
  IChannelStore,
  ChannelStoreMetadata,
  ChannelStoreEvent,
  ChannelAppendOptions,
  ChannelReadOptions,
  ChannelStoreReadResult,
  ChannelDeleteEventOptions,
} from "@federise/gateway-core";
import type { ChannelStorageDO } from "../durable-objects/channel-storage.js";

/**
 * Cloudflare Durable Objects adapter for channel storage.
 * Routes requests to the appropriate DO instance based on channelId.
 */
export class CloudflareChannelDOAdapter implements IChannelStore {
  constructor(private readonly namespace: DurableObjectNamespace<ChannelStorageDO>) {}

  /**
   * Get the DO stub for a specific channel
   */
  private getStub(channelId: string): DurableObjectStub<ChannelStorageDO> {
    const id = this.namespace.idFromName(channelId);
    return this.namespace.get(id);
  }

  async create(
    channelId: string,
    name: string,
    ownerNamespace: string,
    secret: string
  ): Promise<ChannelStoreMetadata> {
    const stub = this.getStub(channelId);
    return await stub.create(channelId, name, ownerNamespace, secret);
  }

  async getMetadata(channelId: string): Promise<ChannelStoreMetadata | null> {
    const stub = this.getStub(channelId);
    return await stub.getMetadata();
  }

  async append(channelId: string, options: ChannelAppendOptions): Promise<ChannelStoreEvent> {
    const stub = this.getStub(channelId);
    return await stub.append(options);
  }

  async read(channelId: string, options?: ChannelReadOptions): Promise<ChannelStoreReadResult> {
    const stub = this.getStub(channelId);
    return await stub.read(options);
  }

  async getEvent(channelId: string, seq: number): Promise<ChannelStoreEvent | null> {
    const stub = this.getStub(channelId);
    return await stub.getEvent(seq);
  }

  async appendDeletion(channelId: string, options: ChannelDeleteEventOptions): Promise<ChannelStoreEvent> {
    const stub = this.getStub(channelId);
    return await stub.appendDeletion(options);
  }

  async delete(channelId: string): Promise<void> {
    const stub = this.getStub(channelId);
    await stub.deleteAll();
  }
}

import { OpenAPIRoute } from "chanfana";
import {
  ErrorResponse,
  ChannelDeleteRequest,
  ChannelDeleteResponse,
} from "../../types.js";
import type { AppContext } from "../../context.js";

export class ChannelDeleteEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Channel Operations"],
    summary: "Delete a channel and all its events",
    security: [{ apiKey: [] }],
    request: {
      body: {
        content: { "application/json": { schema: ChannelDeleteRequest } },
      },
    },
    responses: {
      "200": {
        description: "Channel deleted successfully",
        content: { "application/json": { schema: ChannelDeleteResponse } },
      },
      "401": {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorResponse } },
      },
      "403": {
        description: "Forbidden - not the channel owner",
        content: { "application/json": { schema: ErrorResponse } },
      },
      "404": {
        description: "Channel not found",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  };

  async handle(c: AppContext) {
    const data = await this.getValidatedData<typeof this.schema>();
    const kv = c.get("kv");
    const channelStore = c.get("channelStore");

    const channelId = data.body.channelId;
    const namespace = data.body.namespace;

    // Get channel metadata
    const meta = await channelStore.getMetadata(channelId);
    if (!meta) {
      return c.json({ code: "NOT_FOUND", message: "Channel not found" }, 404);
    }

    // Verify caller owns the channel
    if (meta.ownerNamespace !== namespace) {
      return c.json({ code: "FORBIDDEN", message: "Not the channel owner" }, 403);
    }

    // Delete all channel data from Durable Object
    await channelStore.delete(channelId);

    // Delete index entry and ownership lookup from KV
    await kv.delete(`__CHANNEL_INDEX:${namespace}:${channelId}`);
    await kv.delete(`__CHANNEL_OWNER:${channelId}`);

    return c.json({ success: true });
  }
}

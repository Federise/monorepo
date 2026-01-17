import { OpenAPIRoute } from "chanfana";
import {
  ErrorResponse,
  ChannelListRequest,
  ChannelListResponse,
} from "../../types.js";
import type { AppContext } from "../../context.js";

export class ChannelListEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Channel Operations"],
    summary: "List channels for a namespace",
    security: [{ apiKey: [] }],
    request: {
      body: {
        content: { "application/json": { schema: ChannelListRequest } },
      },
    },
    responses: {
      "200": {
        description: "Channels retrieved successfully",
        content: { "application/json": { schema: ChannelListResponse } },
      },
      "401": {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  };

  async handle(c: AppContext) {
    const data = await this.getValidatedData<typeof this.schema>();
    const kv = c.get("kv");

    // List channels by namespace index
    const prefix = `__CHANNEL_INDEX:${data.body.namespace}:`;
    const result = await kv.list({ prefix, limit: 100 });

    const channels = [];
    for (const key of result.keys) {
      const value = await kv.get(key.name);
      if (value) {
        const indexData = JSON.parse(value);
        channels.push({
          channelId: indexData.channelId,
          name: indexData.name,
          ownerNamespace: data.body.namespace,
          createdAt: indexData.createdAt,
        });
      }
    }

    return c.json({ channels });
  }
}

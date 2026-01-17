import { OpenAPIRoute } from "chanfana";
import {
  ErrorResponse,
  ChannelCreateRequest,
  ChannelCreateResponse,
} from "../../types.js";
import type { AppContext } from "../../context.js";
import { generateApiKey } from "../../lib/crypto.js";

export class ChannelCreateEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Channel Operations"],
    summary: "Create a new channel",
    security: [{ apiKey: [] }],
    request: {
      body: {
        content: { "application/json": { schema: ChannelCreateRequest } },
      },
    },
    responses: {
      "200": {
        description: "Channel created successfully",
        content: { "application/json": { schema: ChannelCreateResponse } },
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
    const channelStore = c.get("channelStore");

    // Use shorter channelId (12 hex chars = 6 bytes) for V3 compact tokens
    const channelId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const secret = generateApiKey();

    // Create channel in Durable Object
    const metadata = await channelStore.create(
      channelId,
      data.body.name,
      data.body.namespace,
      secret
    );

    // Store channel index in KV for listing by namespace
    await kv.put(
      `__CHANNEL_INDEX:${data.body.namespace}:${channelId}`,
      JSON.stringify({ channelId, name: data.body.name, createdAt: metadata.createdAt })
    );

    // Store ownership lookup for access control
    await kv.put(`__CHANNEL_OWNER:${channelId}`, data.body.namespace);

    return c.json({
      metadata: {
        channelId,
        name: data.body.name,
        ownerNamespace: data.body.namespace,
        createdAt: metadata.createdAt,
      },
      secret,
    });
  }
}

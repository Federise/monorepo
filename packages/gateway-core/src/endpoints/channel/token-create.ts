import { OpenAPIRoute } from "chanfana";
import {
  ErrorResponse,
  ChannelTokenCreateRequest,
  ChannelTokenCreateResponse,
} from "../../types.js";
import type { AppContext } from "../../context.js";
import { createChannelToken } from "../../lib/channel-token.js";

export class ChannelTokenCreateEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Channel Operations"],
    summary: "Create a capability token for sharing a channel",
    security: [{ apiKey: [] }],
    request: {
      body: {
        content: { "application/json": { schema: ChannelTokenCreateRequest } },
      },
    },
    responses: {
      "200": {
        description: "Token created successfully",
        content: { "application/json": { schema: ChannelTokenCreateResponse } },
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
    const channelStore = c.get("channelStore");

    const channelId = data.body.channelId;
    const namespace = data.body.namespace;

    // Get channel metadata
    const meta = await channelStore.getMetadata(channelId);
    if (!meta) {
      return c.json({ code: 404, message: "Channel not found" }, 404);
    }

    // Verify caller owns the channel
    if (meta.ownerNamespace !== namespace) {
      return c.json({ code: 403, message: "Not the channel owner" }, 403);
    }

    // Create the capability token
    // If displayName is provided, V4 format is used with the name as authorId
    // Otherwise, V3 format is used with a random 4-char hex authorId
    const { token, expiresAt } = await createChannelToken(
      {
        channelId,
        permissions: data.body.permissions,
        displayName: data.body.displayName,
        expiresInSeconds: data.body.expiresInSeconds ?? 604800, // 7 days default
      },
      meta.secret
    );

    return c.json({
      token,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    });
  }
}

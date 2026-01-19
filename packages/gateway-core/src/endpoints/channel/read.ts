import { OpenAPIRoute } from "chanfana";
import {
  ErrorResponse,
  ChannelReadRequest,
  ChannelReadResponse,
} from "../../types.js";
import type { AppContext } from "../../context.js";
import { verifyChannelToken } from "../../lib/channel-token.js";

export class ChannelReadEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Channel Operations"],
    summary: "Read events from a channel",
    description:
      "Authenticated via API key or capability token (X-Channel-Token header)",
    request: {
      body: {
        content: { "application/json": { schema: ChannelReadRequest } },
      },
    },
    responses: {
      "200": {
        description: "Events retrieved successfully",
        content: { "application/json": { schema: ChannelReadResponse } },
      },
      "401": {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorResponse } },
      },
      "403": {
        description: "Forbidden - insufficient permissions",
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
    const afterSeq = data.body.afterSeq ?? 0;
    const limit = data.body.limit ?? 50;

    // Get channel metadata to retrieve secret
    const meta = await channelStore.getMetadata(channelId);
    if (!meta) {
      return c.json({ code: "NOT_FOUND", message: "Channel not found" }, 404);
    }

    // Check authentication: either API key (already authenticated) or token
    const tokenHeader = c.req.header("X-Channel-Token");

    if (tokenHeader) {
      // Token-based authentication
      const verified = await verifyChannelToken(tokenHeader, meta.secret);
      if (!verified) {
        return c.json({ code: "UNAUTHORIZED", message: "Invalid or expired token" }, 401);
      }
      if (!verified.permissions.includes("read")) {
        return c.json({ code: "FORBIDDEN", message: "Token lacks read permission" }, 403);
      }
    }
    // If no token, we assume API key auth (already validated by middleware)

    // Read events from Durable Object
    const result = await channelStore.read(channelId, { afterSeq, limit });

    return c.json(result);
  }
}

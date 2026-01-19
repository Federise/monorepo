import { OpenAPIRoute } from "chanfana";
import {
  ErrorResponse,
  ChannelAppendRequest,
  ChannelAppendResponse,
} from "../../types.js";
import type { AppContext } from "../../context.js";
import { verifyChannelToken } from "../../lib/channel-token.js";

export class ChannelAppendEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Channel Operations"],
    summary: "Append an event to a channel",
    description:
      "Authenticated via API key or capability token (X-Channel-Token header)",
    request: {
      body: {
        content: { "application/json": { schema: ChannelAppendRequest } },
      },
    },
    responses: {
      "200": {
        description: "Event appended successfully",
        content: { "application/json": { schema: ChannelAppendResponse } },
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

    // Get channel metadata to retrieve secret
    const meta = await channelStore.getMetadata(channelId);
    if (!meta) {
      return c.json({ code: "NOT_FOUND", message: "Channel not found" }, 404);
    }

    // Check authentication: either API key (already authenticated) or token
    const tokenHeader = c.req.header("X-Channel-Token");
    let authorId: string;

    if (tokenHeader) {
      // Token-based authentication
      const verified = await verifyChannelToken(tokenHeader, meta.secret);
      if (!verified) {
        return c.json({ code: "UNAUTHORIZED", message: "Invalid or expired token" }, 401);
      }
      if (!verified.permissions.includes("append")) {
        return c.json({ code: "FORBIDDEN", message: "Token lacks append permission" }, 403);
      }
      authorId = verified.authorId;
    } else {
      // API key authentication - must provide authorId in body
      if (!data.body.authorId) {
        return c.json(
          { code: "INVALID_REQUEST", message: "authorId required for API key auth" },
          400
        );
      }
      authorId = data.body.authorId;
    }

    // Append event atomically via Durable Object
    const event = await channelStore.append(channelId, {
      authorId,
      content: data.body.content,
    });

    return c.json({ event });
  }
}

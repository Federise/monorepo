import { OpenAPIRoute } from "chanfana";
import {
  ErrorResponse,
  ChannelDeleteEventRequest,
  ChannelDeleteEventResponse,
} from "../../types.js";
import type { AppContext } from "../../context.js";
import { verifyChannelToken } from "../../lib/channel-token.js";

export class ChannelDeleteEventEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Channel Operations"],
    summary: "Soft-delete an event in a channel",
    description:
      "Authenticated via API key or capability token (X-Channel-Token header). " +
      "Requires delete:own (can only delete own events) or delete:any permission.",
    request: {
      body: {
        content: { "application/json": { schema: ChannelDeleteEventRequest } },
      },
    },
    responses: {
      "200": {
        description: "Deletion marker created successfully",
        content: { "application/json": { schema: ChannelDeleteEventResponse } },
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
        description: "Channel or event not found",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  };

  async handle(c: AppContext) {
    const data = await this.getValidatedData<typeof this.schema>();
    const channelStore = c.get("channelStore");
    const channelId = data.body.channelId;
    const targetSeq = data.body.targetSeq;

    // Get channel metadata to retrieve secret
    const meta = await channelStore.getMetadata(channelId);
    if (!meta) {
      return c.json({ code: 404, message: "Channel not found" }, 404);
    }

    // Check authentication: either API key (already authenticated) or token
    const tokenHeader = c.req.header("X-Channel-Token");
    let authorId: string;
    let canDeleteAny = false;

    if (tokenHeader) {
      // Token-based authentication
      const verified = await verifyChannelToken(tokenHeader, meta.secret);
      if (!verified) {
        return c.json({ code: 401, message: "Invalid or expired token" }, 401);
      }

      // Check for delete permissions
      const hasDeleteOwn = verified.permissions.includes("delete:own");
      const hasDeleteAny = verified.permissions.includes("delete:any");

      if (!hasDeleteOwn && !hasDeleteAny) {
        return c.json({ code: 403, message: "Token lacks delete permission" }, 403);
      }

      canDeleteAny = hasDeleteAny;
      authorId = verified.authorId;
    } else {
      // API key authentication - must provide authorId in body
      // API key users have full delete:any permissions
      if (!data.body.authorId) {
        return c.json(
          { code: 400, message: "authorId required for API key auth" },
          400
        );
      }
      authorId = data.body.authorId;
      canDeleteAny = true; // API key auth grants full permissions
    }

    // Get the target event to check ownership
    const targetEvent = await channelStore.getEvent(channelId, targetSeq);
    if (!targetEvent) {
      return c.json({ code: 404, message: "Event not found" }, 404);
    }

    // Check ownership if user only has delete:own permission
    if (!canDeleteAny && targetEvent.authorId !== authorId) {
      return c.json(
        { code: 403, message: "Can only delete own events" },
        403
      );
    }

    // Append deletion marker
    const event = await channelStore.appendDeletion(channelId, {
      authorId,
      targetSeq,
    });

    return c.json({ event });
  }
}

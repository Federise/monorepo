import { OpenAPIRoute } from "chanfana";
import {
  ErrorResponse,
  LogAppendRequest,
  LogAppendResponse,
} from "../../types.js";
import type { AppContext } from "../../context.js";
import { verifyLogToken } from "../../lib/log-token.js";

export class LogAppendEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Log Operations"],
    summary: "Append an event to a log",
    description:
      "Authenticated via API key or capability token (X-Log-Token header)",
    request: {
      body: {
        content: { "application/json": { schema: LogAppendRequest } },
      },
    },
    responses: {
      "200": {
        description: "Event appended successfully",
        content: { "application/json": { schema: LogAppendResponse } },
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
        description: "Log not found",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  };

  async handle(c: AppContext) {
    const data = await this.getValidatedData<typeof this.schema>();
    const logStore = c.get("logStore");
    const logId = data.body.logId;

    // Get log metadata to retrieve secret
    const meta = await logStore.getMetadata(logId);
    if (!meta) {
      return c.json({ code: 404, message: "Log not found" }, 404);
    }

    // Check authentication: either API key (already authenticated) or token
    const tokenHeader = c.req.header("X-Log-Token");
    let authorId: string;

    if (tokenHeader) {
      // Token-based authentication
      const verified = await verifyLogToken(tokenHeader, meta.secret);
      if (!verified) {
        return c.json({ code: 401, message: "Invalid or expired token" }, 401);
      }
      if (!verified.permissions.includes("write")) {
        return c.json({ code: 403, message: "Token lacks write permission" }, 403);
      }
      authorId = verified.authorId;
    } else {
      // API key authentication - must provide authorId in body
      if (!data.body.authorId) {
        return c.json(
          { code: 400, message: "authorId required for API key auth" },
          400
        );
      }
      authorId = data.body.authorId;
    }

    // Append event atomically via Durable Object
    const event = await logStore.append(logId, {
      authorId,
      content: data.body.content,
    });

    return c.json({ event });
  }
}

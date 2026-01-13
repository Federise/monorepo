import { OpenAPIRoute } from "chanfana";
import {
  ErrorResponse,
  LogReadRequest,
  LogReadResponse,
} from "../../types.js";
import type { AppContext } from "../../context.js";
import { verifyLogToken } from "../../lib/log-token.js";

export class LogReadEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Log Operations"],
    summary: "Read events from a log",
    description:
      "Authenticated via API key or capability token (X-Log-Token header)",
    request: {
      body: {
        content: { "application/json": { schema: LogReadRequest } },
      },
    },
    responses: {
      "200": {
        description: "Events retrieved successfully",
        content: { "application/json": { schema: LogReadResponse } },
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
    const afterSeq = data.body.afterSeq ?? 0;
    const limit = data.body.limit ?? 50;

    // Get log metadata to retrieve secret
    const meta = await logStore.getMetadata(logId);
    if (!meta) {
      return c.json({ code: 404, message: "Log not found" }, 404);
    }

    // Check authentication: either API key (already authenticated) or token
    const tokenHeader = c.req.header("X-Log-Token");

    if (tokenHeader) {
      // Token-based authentication
      const verified = await verifyLogToken(tokenHeader, meta.secret);
      if (!verified) {
        return c.json({ code: 401, message: "Invalid or expired token" }, 401);
      }
      if (!verified.permissions.includes("read")) {
        return c.json({ code: 403, message: "Token lacks read permission" }, 403);
      }
    }
    // If no token, we assume API key auth (already validated by middleware)

    // Read events from Durable Object
    const result = await logStore.read(logId, { afterSeq, limit });

    return c.json(result);
  }
}

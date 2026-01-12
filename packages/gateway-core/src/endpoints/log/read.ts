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
    const kv = c.get("kv");
    const logId = data.body.logId;
    const afterSeq = data.body.afterSeq ?? 0;
    const limit = data.body.limit ?? 50;

    // Get log metadata to retrieve secret
    const metaStr = await kv.get(`__LOG:${logId}:meta`);
    if (!metaStr) {
      return c.json({ code: 404, message: "Log not found" }, 404);
    }
    const meta = JSON.parse(metaStr);

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

    // Build prefix for events after the given sequence
    const afterPadded = String(afterSeq).padStart(10, "0");
    const prefix = `__LOG:${logId}:events:`;

    // List all event keys
    const result = await kv.list({ prefix, limit: limit + 1 });

    // Filter to events after afterSeq and fetch their values
    const events = [];
    let hasMore = false;

    for (const key of result.keys) {
      // Extract sequence from key
      const seqStr = key.name.replace(prefix, "");
      const seq = parseInt(seqStr, 10);

      if (seq > afterSeq) {
        if (events.length >= limit) {
          hasMore = true;
          break;
        }

        const value = await kv.get(key.name);
        if (value) {
          events.push(JSON.parse(value));
        }
      }
    }

    return c.json({ events, hasMore });
  }
}

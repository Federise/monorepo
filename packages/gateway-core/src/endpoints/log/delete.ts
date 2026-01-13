import { OpenAPIRoute } from "chanfana";
import {
  ErrorResponse,
  LogDeleteRequest,
  LogDeleteResponse,
} from "../../types.js";
import type { AppContext } from "../../context.js";

export class LogDeleteEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Log Operations"],
    summary: "Delete a log and all its events",
    security: [{ apiKey: [] }],
    request: {
      body: {
        content: { "application/json": { schema: LogDeleteRequest } },
      },
    },
    responses: {
      "200": {
        description: "Log deleted successfully",
        content: { "application/json": { schema: LogDeleteResponse } },
      },
      "401": {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorResponse } },
      },
      "403": {
        description: "Forbidden - not the log owner",
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
    const logStore = c.get("logStore");

    const logId = data.body.logId;
    const namespace = data.body.namespace;

    // Get log metadata
    const meta = await logStore.getMetadata(logId);
    if (!meta) {
      return c.json({ code: 404, message: "Log not found" }, 404);
    }

    // Verify caller owns the log
    if (meta.ownerNamespace !== namespace) {
      return c.json({ code: 403, message: "Not the log owner" }, 403);
    }

    // Delete all log data from Durable Object
    await logStore.delete(logId);

    // Delete index entry and ownership lookup from KV
    await kv.delete(`__LOG_INDEX:${namespace}:${logId}`);
    await kv.delete(`__LOG_OWNER:${logId}`);

    return c.json({ success: true });
  }
}

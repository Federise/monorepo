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

    const logId = data.body.logId;
    const namespace = data.body.namespace;

    // Get log metadata
    const metaStr = await kv.get(`__LOG:${logId}:meta`);
    if (!metaStr) {
      return c.json({ code: 404, message: "Log not found" }, 404);
    }
    const meta = JSON.parse(metaStr);

    // Verify caller owns the log
    if (meta.ownerNamespace !== namespace) {
      return c.json({ code: 403, message: "Not the log owner" }, 403);
    }

    // Get current sequence to know how many events to delete
    const seqStr = await kv.get(`__LOG:${logId}:seq`);
    const maxSeq = seqStr ? parseInt(seqStr, 10) : 0;

    // Delete all events
    for (let seq = 1; seq <= maxSeq; seq++) {
      const paddedSeq = seq.toString().padStart(8, "0");
      await kv.delete(`__LOG:${logId}:events:${paddedSeq}`);
    }

    // Delete log metadata, sequence counter, and index entry
    await kv.delete(`__LOG:${logId}:meta`);
    await kv.delete(`__LOG:${logId}:seq`);
    await kv.delete(`__LOG_INDEX:${namespace}:${logId}`);

    return c.json({ success: true });
  }
}

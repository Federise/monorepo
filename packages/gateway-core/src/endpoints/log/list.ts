import { OpenAPIRoute } from "chanfana";
import {
  ErrorResponse,
  LogListRequest,
  LogListResponse,
} from "../../types.js";
import type { AppContext } from "../../context.js";

export class LogListEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Log Operations"],
    summary: "List logs for a namespace",
    security: [{ apiKey: [] }],
    request: {
      body: {
        content: { "application/json": { schema: LogListRequest } },
      },
    },
    responses: {
      "200": {
        description: "Logs retrieved successfully",
        content: { "application/json": { schema: LogListResponse } },
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

    // List logs by namespace index
    const prefix = `__LOG_INDEX:${data.body.namespace}:`;
    const result = await kv.list({ prefix, limit: 100 });

    const logs = [];
    for (const key of result.keys) {
      const value = await kv.get(key.name);
      if (value) {
        const indexData = JSON.parse(value);
        logs.push({
          logId: indexData.logId,
          name: indexData.name,
          ownerNamespace: data.body.namespace,
          createdAt: indexData.createdAt,
        });
      }
    }

    return c.json({ logs });
  }
}

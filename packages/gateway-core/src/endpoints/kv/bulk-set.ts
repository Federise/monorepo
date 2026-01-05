import { OpenAPIRoute } from "chanfana";

import { BulkSetRequest, BulkSetResponse, ErrorResponse } from "../../types.js";
import type { AppContext } from "../../context.js";

export class KVBulkSetEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Key-Value Operations"],
    summary: "Bulk set values",
    security: [{ apiKey: [] }],
    request: {
      body: {
        content: { "application/json": { schema: BulkSetRequest } },
      },
    },
    responses: {
      "200": {
        description: "The request has succeeded.",
        content: { "application/json": { schema: BulkSetResponse } },
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
    const ns = data.body.namespace;
    await Promise.all(data.body.entries.map((e) => kv.put(`${ns}:${e.key}`, e.value)));
    return { success: true, count: data.body.entries.length };
  }
}

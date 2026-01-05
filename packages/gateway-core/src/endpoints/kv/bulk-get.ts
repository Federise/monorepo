import { OpenAPIRoute } from "chanfana";

import { BulkGetRequest, BulkGetResponse, ErrorResponse } from "../../types.js";
import type { AppContext } from "../../context.js";

export class KVBulkGetEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Key-Value Operations"],
    summary: "Bulk get values",
    security: [{ apiKey: [] }],
    request: {
      body: {
        content: { "application/json": { schema: BulkGetRequest } },
      },
    },
    responses: {
      "200": {
        description: "The request has succeeded.",
        content: { "application/json": { schema: BulkGetResponse } },
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

    const values = await Promise.all(
      data.body.keys.map((key) => kv.get(`${ns}:${key}`))
    );

    const entries = data.body.keys
      .map((key, i) => {
        const value = values[i];
        return value !== null ? { key, value } : null;
      })
      .filter((entry): entry is { key: string; value: string } => entry !== null);

    return { entries };
  }
}

import { OpenAPIRoute } from "chanfana";

import { ErrorResponse, SetRequest } from "../../types.js";
import type { AppContext } from "../../context.js";

export class KVSetEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Key-Value Operations"],
    summary: "Set a key-value pair",
    security: [{ apiKey: [] }],
    request: {
      body: {
        content: { "application/json": { schema: SetRequest } },
      },
    },
    responses: {
      "204": { description: "No content" },
      "401": {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  };

  async handle(c: AppContext) {
    const data = await this.getValidatedData<typeof this.schema>();
    const kv = c.get("kv");
    await kv.put(`${data.body.namespace}:${data.body.key}`, data.body.value);
    return new Response(null, { status: 204 });
  }
}

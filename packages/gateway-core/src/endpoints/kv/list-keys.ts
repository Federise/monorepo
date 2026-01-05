import { z } from "zod";
import { OpenAPIRoute } from "chanfana";

import { ListKeysRequest, ErrorResponse } from "../../types.js";
import type { AppContext } from "../../context.js";

export class KVListKeysEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Key-Value Operations"],
    summary: "List all keys in a namespace",
    security: [{ apiKey: [] }],
    request: {
      body: {
        content: { "application/json": { schema: ListKeysRequest } },
      },
    },
    responses: {
      "200": {
        description: "The request has succeeded.",
        content: { "application/json": { schema: z.array(z.string()) } },
      },
      "401": {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorResponse } },
      },
      "404": {
        description: "Not found",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  };

  async handle(c: AppContext) {
    const data = await this.getValidatedData<typeof this.schema>();
    const kv = c.get("kv");
    const ns = data.body.namespace;
    const list = await kv.list({ prefix: `${ns}:` });
    return list.keys.map((k) => k.name.substring(ns.length + 1));
  }
}

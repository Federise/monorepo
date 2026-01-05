import { z } from "zod";
import { OpenAPIRoute } from "chanfana";

import { ErrorResponse } from "../../types.js";
import type { AppContext } from "../../context.js";

export class KVListNamespacesEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Key-Value Operations"],
    summary: "List all namespaces",
    security: [{ apiKey: [] }],
    responses: {
      "200": {
        description: "The request has succeeded.",
        content: { "application/json": { schema: z.array(z.string()) } },
      },
      "401": {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  };

  async handle(c: AppContext) {
    const kv = c.get("kv");
    const list = await kv.list();
    const namespaces = new Set<string>();

    for (const key of list.keys) {
      const parts = key.name.split(":");
      if (parts.length >= 2 && !parts[0].startsWith("__")) {
        namespaces.add(parts[0]);
      }
    }

    return Array.from(namespaces).sort();
  }
}

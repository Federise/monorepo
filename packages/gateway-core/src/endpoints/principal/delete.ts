import { z } from "zod";
import { OpenAPIRoute } from "chanfana";

import { ErrorResponse } from "../../types.js";
import type { AppContext } from "../../context.js";

export class PrincipalDeleteEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Principal Management"],
    summary: "Delete a principal",
    security: [{ apiKey: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({ secret_hash: z.string() }),
          },
        },
      },
    },
    responses: {
      "204": { description: "No content" },
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
    const val = await kv.get(`__PRINCIPAL:${data.body.secret_hash}`);
    if (!val) {
      return c.json({ code: 404, message: "Not found" }, 404);
    }
    await kv.delete(`__PRINCIPAL:${data.body.secret_hash}`);
    return new Response(null, { status: 204 });
  }
}

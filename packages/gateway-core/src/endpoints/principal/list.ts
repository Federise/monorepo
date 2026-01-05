import { OpenAPIRoute } from "chanfana";

import { PrincipalList, ErrorResponse } from "../../types.js";
import type { AppContext } from "../../context.js";

export class PrincipalListEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Principal Management"],
    summary: "List all principals",
    security: [{ apiKey: [] }],
    responses: {
      "200": {
        description: "The request has succeeded.",
        content: { "application/json": { schema: PrincipalList } },
      },
      "401": {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorResponse } },
      }
    },
  };

  async handle(c: AppContext) {
    const kv = c.get("kv");
    const list = await kv.list({ prefix: "__PRINCIPAL:" });
    const items = (
      await Promise.all(
        list.keys.map(async (k) => {
          const val = await kv.get(k.name);
          if (!val) return null;
          try {
            const principal = JSON.parse(val);
            const secret_hash = k.name.replace("__PRINCIPAL:", "");
            return {
              secret_hash,
              display_name: principal.display_name,
              created_at: principal.created_at,
              active: principal.active,
            };
          } catch {
            return null;
          }
        })
      )
    ).filter((item): item is NonNullable<typeof item> => item !== null);

    return { items };
  }
}

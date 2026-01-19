import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import type { Identity } from "../../lib/identity.js";

const IdentityListResponse = z.object({
  identities: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      displayName: z.string(),
      status: z.string(),
      createdAt: z.string(),
      appConfig: z
        .object({
          origin: z.string(),
          namespace: z.string(),
          grantedCapabilities: z.array(z.string()),
          frameAccess: z.boolean(),
        })
        .optional(),
    })
  ),
});

const ErrorResponse = z.object({
  code: z.number(),
  message: z.string(),
});

export class IdentityListEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Identity Management"],
    summary: "List all identities",
    security: [{ apiKey: [] }],
    responses: {
      "200": {
        description: "List of identities",
        content: { "application/json": { schema: IdentityListResponse } },
      },
      "401": {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  };

  async handle(c: AppContext) {
    const kv = c.get("kv");

    const list = await kv.list({ prefix: "__IDENTITY:" });
    const identities: Partial<Identity>[] = [];

    for (const key of list.keys) {
      const val = await kv.get(key.name);
      if (val) {
        try {
          const identity = JSON.parse(val) as Identity;
          // Skip deleted identities
          if (identity.status === 'deleted') {
            continue;
          }
          identities.push({
            id: identity.id,
            type: identity.type,
            displayName: identity.displayName,
            status: identity.status,
            createdAt: identity.createdAt,
            ...(identity.appConfig && { appConfig: identity.appConfig }),
          });
        } catch {
          // Skip malformed entries
        }
      }
    }

    return { identities };
  }
}

import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../context.js";

const WhoAmIResponse = z.object({
  identityId: z.string(),
  displayName: z.string(),
  type: z.string(),
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
});

const ErrorResponse = z.object({
  code: z.number(),
  message: z.string(),
});

/**
 * WhoAmI endpoint - Returns the identity associated with the current credential.
 *
 * This endpoint is useful for:
 * - Resolving identity ID after migration from legacy credentials
 * - Verifying which identity a credential belongs to
 * - Getting current identity info without needing to list all identities
 */
export class IdentityWhoAmIEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Identity Management"],
    summary: "Get current identity",
    description:
      "Returns information about the identity associated with the current API key",
    security: [{ apiKey: [] }],
    responses: {
      "200": {
        description: "Current identity information",
        content: { "application/json": { schema: WhoAmIResponse } },
      },
      "401": {
        description: "Unauthorized - no valid API key provided",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  };

  async handle(c: AppContext) {
    const identity = c.get("identity");

    if (!identity) {
      return c.json({ code: "UNAUTHORIZED", message: "Not authenticated" }, 401);
    }

    return c.json({
      identityId: identity.id,
      displayName: identity.displayName,
      type: identity.type,
      status: identity.status,
      createdAt: identity.createdAt,
      ...(identity.appConfig && { appConfig: identity.appConfig }),
    });
  }
}

import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { deserializeToken, type StatefulToken } from "../../lib/stateful-token.js";

const TokenListRequest = z.object({
  includeUsed: z.boolean().optional().default(false),
  includeRevoked: z.boolean().optional().default(false),
  includeExpired: z.boolean().optional().default(false),
});

const TokenSummary = z.object({
  id: z.string(),
  action: z.string(),
  label: z.string().optional(),
  createdAt: z.string(),
  expiresAt: z.string(),
  status: z.enum(["valid", "used", "revoked", "expired"]),
});

const TokenListResponse = z.object({
  tokens: z.array(TokenSummary),
});

const ErrorResponse = z.object({
  code: z.number(),
  message: z.string(),
});

export class TokenListEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Token"],
    summary: "List tokens created by the authenticated identity",
    description: "List all stateful tokens created by the authenticated identity.",
    security: [{ apiKey: [] }],
    request: {
      body: {
        content: { "application/json": { schema: TokenListRequest } },
      },
    },
    responses: {
      "200": {
        description: "List of tokens",
        content: { "application/json": { schema: TokenListResponse } },
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
    const identity = c.get("identity");

    // Must be authenticated
    if (!identity) {
      return c.json({ code: "UNAUTHORIZED", message: "Unauthorized" }, 401);
    }

    const { includeUsed, includeRevoked, includeExpired } = data.body;

    // List all tokens (using KV list with prefix)
    const tokenList = await kv.list({ prefix: "__TOKEN:" });
    const tokens: Array<{
      id: string;
      action: string;
      label?: string;
      createdAt: string;
      expiresAt: string;
      status: "valid" | "used" | "revoked" | "expired";
    }> = [];

    const now = new Date();

    for (const key of tokenList.keys) {
      const tokenJson = await kv.get(key.name);
      if (!tokenJson) continue;

      const token = deserializeToken(tokenJson);
      if (!token) continue;

      // Only show tokens created by this identity
      if (token.createdBy !== identity.id) continue;

      // Determine status
      let status: "valid" | "used" | "revoked" | "expired";
      if (token.revoked) {
        status = "revoked";
      } else if (token.usedAt) {
        status = "used";
      } else if (new Date(token.expiresAt) < now) {
        status = "expired";
      } else {
        status = "valid";
      }

      // Filter based on options
      if (status === "used" && !includeUsed) continue;
      if (status === "revoked" && !includeRevoked) continue;
      if (status === "expired" && !includeExpired) continue;

      tokens.push({
        id: token.id,
        action: token.action,
        label: token.label,
        createdAt: token.createdAt,
        expiresAt: token.expiresAt,
        status,
      });
    }

    // Sort by creation date, newest first
    tokens.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return { tokens };
  }
}

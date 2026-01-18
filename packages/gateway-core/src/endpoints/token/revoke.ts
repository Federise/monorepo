import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import {
  deserializeToken,
  getTokenKVKey,
  isValidTokenId,
  revokeToken,
  serializeToken,
} from "../../lib/stateful-token.js";

const TokenRevokeRequest = z.object({
  tokenId: z.string().min(1),
  reason: z.string().max(200).optional(),
});

const TokenRevokeResponse = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

const ErrorResponse = z.object({
  code: z.number(),
  message: z.string(),
});

export class TokenRevokeEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Token"],
    summary: "Revoke a stateful token",
    description: "Revoke a token so it can no longer be used.",
    security: [{ apiKey: [] }],
    request: {
      body: {
        content: { "application/json": { schema: TokenRevokeRequest } },
      },
    },
    responses: {
      "200": {
        description: "Revocation result",
        content: { "application/json": { schema: TokenRevokeResponse } },
      },
      "400": {
        description: "Invalid request",
        content: { "application/json": { schema: ErrorResponse } },
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
    const { tokenId, reason } = data.body;

    // Must be authenticated
    if (!identity) {
      return c.json({ code: 401, message: "Unauthorized" }, 401);
    }

    // Validate token ID format
    if (!isValidTokenId(tokenId)) {
      return {
        success: false,
        error: "Invalid token format",
      };
    }

    // Look up token in KV
    const tokenJson = await kv.get(getTokenKVKey(tokenId));
    if (!tokenJson) {
      return {
        success: false,
        error: "Token not found",
      };
    }

    // Deserialize token
    const token = deserializeToken(tokenJson);
    if (!token) {
      return {
        success: false,
        error: "Invalid token data",
      };
    }

    // Check if caller owns the token
    if (token.createdBy !== identity.id) {
      return c.json({ code: 403, message: "Not authorized to revoke this token" }, 403);
    }

    // Check if already revoked
    if (token.revoked) {
      return {
        success: false,
        error: "Token is already revoked",
      };
    }

    // Revoke the token
    const revokedToken = revokeToken(token, reason);
    await kv.put(getTokenKVKey(tokenId), serializeToken(revokedToken));

    return {
      success: true,
    };
  }
}

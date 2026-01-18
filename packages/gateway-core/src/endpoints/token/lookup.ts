import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import {
  deserializeToken,
  getTokenKVKey,
  isValidTokenId,
  isTokenValid,
  getTokenInvalidReason,
  TokenAction,
  type StatefulToken,
} from "../../lib/stateful-token.js";

const TokenLookupRequest = z.object({
  tokenId: z.string().min(1),
});

const TokenLookupResponse = z.object({
  valid: z.boolean(),
  action: z.string().optional(),
  label: z.string().optional(),
  expiresAt: z.string().optional(),
  identityInfo: z
    .object({
      displayName: z.string(),
      type: z.string(),
    })
    .optional(),
  error: z.string().optional(),
});

const ErrorResponse = z.object({
  code: z.number(),
  message: z.string(),
});

export class TokenLookupEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Token"],
    summary: "Look up a stateful token",
    description: "Look up token information. Used by the Frame to determine what action to take.",
    request: {
      body: {
        content: { "application/json": { schema: TokenLookupRequest } },
      },
    },
    responses: {
      "200": {
        description: "Token lookup result",
        content: { "application/json": { schema: TokenLookupResponse } },
      },
      "400": {
        description: "Invalid request",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  };

  async handle(c: AppContext) {
    const data = await this.getValidatedData<typeof this.schema>();
    const kv = c.get("kv");
    const { tokenId } = data.body;

    // Validate token ID format
    if (!isValidTokenId(tokenId)) {
      return {
        valid: false,
        error: "Invalid token format",
      };
    }

    // Look up token in KV
    const tokenJson = await kv.get(getTokenKVKey(tokenId));
    if (!tokenJson) {
      return {
        valid: false,
        error: "Token not found",
      };
    }

    // Deserialize token
    const token = deserializeToken(tokenJson);
    if (!token) {
      return {
        valid: false,
        error: "Invalid token data",
      };
    }

    // Check if token is valid
    if (!isTokenValid(token)) {
      return {
        valid: false,
        error: getTokenInvalidReason(token) || "Token is invalid",
      };
    }

    // Build response based on token type
    const response: {
      valid: boolean;
      action: string;
      label?: string;
      expiresAt: string;
      identityInfo?: { displayName: string; type: string };
    } = {
      valid: true,
      action: token.action,
      label: token.label,
      expiresAt: token.expiresAt,
    };

    // For identity claim tokens, include identity info
    if (token.action === TokenAction.IDENTITY_CLAIM) {
      const identityJson = await kv.get(`__IDENTITY:${token.payload.identityId}`);
      if (identityJson) {
        const identity = JSON.parse(identityJson);
        response.identityInfo = {
          displayName: identity.displayName,
          type: identity.type,
        };
      }
    }

    return response;
  }
}

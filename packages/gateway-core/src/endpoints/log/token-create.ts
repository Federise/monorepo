import { OpenAPIRoute } from "chanfana";
import {
  ErrorResponse,
  LogTokenCreateRequest,
  LogTokenCreateResponse,
} from "../../types.js";
import type { AppContext } from "../../context.js";
import { createLogToken } from "../../lib/log-token.js";

export class LogTokenCreateEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Log Operations"],
    summary: "Create a capability token for sharing a log",
    security: [{ apiKey: [] }],
    request: {
      body: {
        content: { "application/json": { schema: LogTokenCreateRequest } },
      },
    },
    responses: {
      "200": {
        description: "Token created successfully",
        content: { "application/json": { schema: LogTokenCreateResponse } },
      },
      "401": {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorResponse } },
      },
      "403": {
        description: "Forbidden - not the log owner",
        content: { "application/json": { schema: ErrorResponse } },
      },
      "404": {
        description: "Log not found",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  };

  async handle(c: AppContext) {
    const data = await this.getValidatedData<typeof this.schema>();
    const kv = c.get("kv");
    const config = c.get("config");

    const logId = data.body.logId;
    const namespace = data.body.namespace;

    // Get log metadata
    const metaStr = await kv.get(`__LOG:${logId}:meta`);
    if (!metaStr) {
      return c.json({ code: 404, message: "Log not found" }, 404);
    }
    const meta = JSON.parse(metaStr);

    // Verify caller owns the log
    if (meta.ownerNamespace !== namespace) {
      return c.json({ code: 403, message: "Not the log owner" }, 403);
    }

    // Generate unique author ID for this token
    const authorId = crypto.randomUUID().slice(0, 8);

    // Determine gateway URL from request
    const url = new URL(c.req.url);
    const gatewayUrl = `${url.protocol}//${url.host}`;

    // Create the capability token
    const { token, expiresAt } = await createLogToken(
      {
        logId,
        gatewayUrl,
        permissions: data.body.permissions,
        authorId,
        expiresInSeconds: data.body.expiresInSeconds ?? 604800, // 7 days default
      },
      meta.secret
    );

    return c.json({
      token,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    });
  }
}

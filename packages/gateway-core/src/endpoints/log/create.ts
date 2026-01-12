import { OpenAPIRoute } from "chanfana";
import {
  ErrorResponse,
  LogCreateRequest,
  LogCreateResponse,
} from "../../types.js";
import type { AppContext } from "../../context.js";
import { generateApiKey } from "../../lib/crypto.js";

export class LogCreateEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Log Operations"],
    summary: "Create a new log",
    security: [{ apiKey: [] }],
    request: {
      body: {
        content: { "application/json": { schema: LogCreateRequest } },
      },
    },
    responses: {
      "200": {
        description: "Log created successfully",
        content: { "application/json": { schema: LogCreateResponse } },
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

    const logId = crypto.randomUUID();
    const secret = generateApiKey();
    const createdAt = new Date().toISOString();

    const metadata = {
      logId,
      name: data.body.name,
      ownerNamespace: data.body.namespace,
      createdAt,
      secret, // Stored but not exposed in list responses
    };

    // Store log metadata
    await kv.put(`__LOG:${logId}:meta`, JSON.stringify(metadata));

    // Store log index for listing by namespace
    await kv.put(
      `__LOG_INDEX:${data.body.namespace}:${logId}`,
      JSON.stringify({ logId, name: data.body.name, createdAt })
    );

    // Initialize sequence counter
    await kv.put(`__LOG:${logId}:seq`, "0");

    return c.json({
      metadata: {
        logId,
        name: data.body.name,
        ownerNamespace: data.body.namespace,
        createdAt,
      },
      secret,
    });
  }
}

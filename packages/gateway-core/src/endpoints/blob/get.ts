import { OpenAPIRoute } from "chanfana";
import {
  BlobGetRequest,
  BlobGetResponse,
  ErrorResponse,
} from "../../types.js";
import type { AppContext } from "../../context.js";

export class BlobGetEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Blob Operations"],
    summary: "Get blob download URL",
    security: [{ apiKey: [] }],
    request: {
      body: {
        content: { "application/json": { schema: BlobGetRequest } },
      },
    },
    responses: {
      "200": {
        description: "Download URL generated",
        content: { "application/json": { schema: BlobGetResponse } },
      },
      "401": {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorResponse } },
      },
      "404": {
        description: "Blob not found",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  };

  async handle(c: AppContext) {
    const data = await this.getValidatedData<typeof this.schema>();
    const { namespace, key } = data.body;
    const kv = c.get("kv");

    // Get metadata from KV
    const kvKey = `__BLOB:${namespace}:${key}`;
    const metadataStr = await kv.get(kvKey);

    if (!metadataStr) {
      return c.json({ code: 404, message: "Blob not found" }, 404);
    }

    const metadata = JSON.parse(metadataStr);

    // Build download URL through the gateway
    const gatewayOrigin = new URL(c.req.url).origin;
    const url = `${gatewayOrigin}/blob/download/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`;

    return {
      url,
      metadata,
      // No expiry - gateway handles auth
    };
  }
}

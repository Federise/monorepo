import { OpenAPIRoute } from "chanfana";
import {
  BlobDeleteRequest,
  ErrorResponse,
} from "../../types.js";
import type { AppContext } from "../../context.js";

export class BlobDeleteEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Blob Operations"],
    summary: "Delete a blob",
    security: [{ apiKey: [] }],
    request: {
      body: {
        content: { "application/json": { schema: BlobDeleteRequest } },
      },
    },
    responses: {
      "204": {
        description: "Blob deleted successfully",
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

    // Check if blob exists
    const kvKey = `__BLOB:${namespace}:${key}`;
    const metadataStr = await kv.get(kvKey);

    if (!metadataStr) {
      return c.json({ code: 404, message: "Blob not found" }, 404);
    }

    const r2Key = `${namespace}:${key}`;

    // Delete from single bucket
    const blob = c.get("blob");
    await blob.delete(r2Key);

    // Delete metadata from KV
    await kv.delete(kvKey);

    return new Response(null, { status: 204 });
  }
}

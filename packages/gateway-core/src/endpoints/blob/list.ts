import { OpenAPIRoute } from "chanfana";
import {
  BlobListRequest,
  BlobListResponse,
  ErrorResponse,
} from "../../types.js";
import type { AppContext } from "../../context.js";

export class BlobListEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Blob Operations"],
    summary: "List blobs",
    security: [{ apiKey: [] }],
    request: {
      body: {
        content: { "application/json": { schema: BlobListRequest } },
      },
    },
    responses: {
      "200": {
        description: "List of blobs",
        content: { "application/json": { schema: BlobListResponse } },
      },
      "401": {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  };

  async handle(c: AppContext) {
    const data = await this.getValidatedData<typeof this.schema>();
    const { namespace } = data.body;
    const kv = c.get("kv");

    // Build prefix for KV list
    const prefix = namespace ? `__BLOB:${namespace}:` : "__BLOB:";

    // List all blob metadata from KV
    const list = await kv.list({ prefix });

    // Fetch all metadata
    const metadataPromises = list.keys.map(async (item) => {
      const value = await kv.get(item.name);
      return value ? JSON.parse(value) : null;
    });

    const blobs = (await Promise.all(metadataPromises)).filter(
      (m) => m !== null
    );

    return { blobs };
  }
}

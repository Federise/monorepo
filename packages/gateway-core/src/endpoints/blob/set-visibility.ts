import { OpenAPIRoute } from "chanfana";
import {
  BlobSetVisibilityRequest,
  BlobSetVisibilityResponse,
  ErrorResponse,
} from "../../types.js";
import type { AppContext } from "../../context.js";

/**
 * Change blob visibility endpoint.
 *
 * Allows changing a blob's visibility level without re-uploading.
 * Requires blob:write capability.
 */
export class BlobSetVisibilityEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Blob Operations"],
    summary: "Change blob visibility",
    description: "Update the visibility level of an existing blob. Requires blob:write capability.",
    security: [{ apiKey: [] }],
    request: {
      body: {
        content: { "application/json": { schema: BlobSetVisibilityRequest } },
      },
    },
    responses: {
      "200": {
        description: "Visibility updated successfully",
        content: { "application/json": { schema: BlobSetVisibilityResponse } },
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
    const { namespace, key, visibility } = data.body;
    const kv = c.get("kv");

    // Get existing metadata
    const kvKey = `__BLOB:${namespace}:${key}`;
    const metadataStr = await kv.get(kvKey);

    if (!metadataStr) {
      return c.json({ code: 404, message: "Blob not found" }, 404);
    }

    // Parse and update metadata
    const metadata = JSON.parse(metadataStr);
    metadata.visibility = visibility;

    // Remove legacy isPublic field if present
    delete metadata.isPublic;

    // Save updated metadata
    await kv.put(kvKey, JSON.stringify(metadata));

    return c.json({ metadata });
  }
}

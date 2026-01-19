import { OpenAPIRoute } from "chanfana";
import {
  BlobGetRequest,
  BlobGetResponse,
  ErrorResponse,
} from "../../types.js";
import type { AppContext } from "../../context.js";
import type { BlobVisibility } from "../../types.js";
import { generateSignedDownloadUrl } from "../../lib/hmac.js";
import { getOrCreateAlias } from "../../lib/namespace-alias.js";

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
    const config = c.get("config");

    // Get metadata from KV
    const kvKey = `__BLOB:${namespace}:${key}`;
    const metadataStr = await kv.get(kvKey);

    if (!metadataStr) {
      return c.json({ code: "NOT_FOUND", message: "Blob not found" }, 404);
    }

    const metadata = JSON.parse(metadataStr);

    // Handle legacy isPublic field
    const visibility: BlobVisibility = metadata.visibility ??
      (metadata.isPublic ? "public" : "private");

    // Normalize metadata to new format for response
    const normalizedMetadata = {
      ...metadata,
      visibility,
    };
    delete normalizedMetadata.isPublic;

    const gatewayOrigin = new URL(c.req.url).origin;

    // Get or create short alias for prettier URLs
    const alias = await getOrCreateAlias(kv, namespace);

    // For public files, return direct URL without signature
    if (visibility === "public") {
      const url = `${gatewayOrigin}/blob/f/${encodeURIComponent(alias)}/${encodeURIComponent(key)}`;
      return {
        url,
        metadata: normalizedMetadata,
        // No expiry for public files
      };
    }

    // For presigned or private files, generate HMAC-signed URL
    // Note: signature is based on alias (not full namespace) for shorter URLs
    const expiresIn = config.presignExpiresIn || 3600; // Default 1 hour

    const { url, expiresAt } = await generateSignedDownloadUrl(
      gatewayOrigin,
      alias,
      key,
      config.signingSecret,
      expiresIn
    );

    const expiresAtIso = new Date(expiresAt * 1000).toISOString();

    return {
      url,
      metadata: normalizedMetadata,
      expiresAt: expiresAtIso,
    };
  }
}

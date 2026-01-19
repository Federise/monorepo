import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import {
  BlobMetadata,
  BlobVisibility,
  ErrorResponse,
} from "../../types.js";
import type { AppContext } from "../../context.js";
import type { BlobVisibility as BlobVisibilityType } from "../../types.js";
import { getOrCreateAlias } from "../../lib/namespace-alias.js";

// Response after successful upload
const BlobUploadResponse = z.object({
  metadata: BlobMetadata,
});

export class BlobUploadEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Blob Operations"],
    summary: "Upload a blob directly to storage",
    security: [{ apiKey: [] }],
    responses: {
      "200": {
        description: "Blob uploaded successfully",
        content: { "application/json": { schema: BlobUploadResponse } },
      },
      "400": {
        description: "Bad request",
        content: { "application/json": { schema: ErrorResponse } },
      },
      "401": {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  };

  async handle(c: AppContext) {
    const namespace = c.req.header("x-blob-namespace");
    const key = c.req.header("x-blob-key");
    const contentType = c.req.header("content-type") || "application/octet-stream";

    // Support both new visibility header and legacy isPublic header
    const visibilityHeader = c.req.header("x-blob-visibility");
    const isPublicHeader = c.req.header("x-blob-public");

    let visibility: BlobVisibilityType = "private";
    if (visibilityHeader) {
      const parsed = BlobVisibility.safeParse(visibilityHeader);
      if (parsed.success) {
        visibility = parsed.data;
      }
    } else if (isPublicHeader === "true") {
      // Legacy support: isPublic=true maps to "public"
      visibility = "public";
    }

    if (!namespace || !key) {
      return c.json({ code: "INVALID_REQUEST", message: "Missing x-blob-namespace or x-blob-key header" }, 400);
    }

    // Get the raw body
    const body = await c.req.arrayBuffer();
    const size = body.byteLength;

    if (size === 0) {
      return c.json({ code: "INVALID_REQUEST", message: "Empty file" }, 400);
    }

    const kv = c.get("kv");
    const blob = c.get("blob"); // Single bucket
    const r2Key = `${namespace}:${key}`;

    // Upload to blob storage
    await blob.put(r2Key, body, {
      httpMetadata: {
        contentType,
      },
    });

    // Create metadata record in KV
    const metadata = {
      key,
      namespace,
      size,
      contentType,
      uploadedAt: new Date().toISOString(),
      visibility,
    };

    const kvKey = `__BLOB:${namespace}:${key}`;
    await kv.put(kvKey, JSON.stringify(metadata));

    // Ensure namespace alias exists for shorter URLs
    await getOrCreateAlias(kv, namespace);

    return c.json({ metadata });
  }
}

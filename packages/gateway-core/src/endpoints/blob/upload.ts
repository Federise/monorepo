import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import {
  BlobMetadata,
  ErrorResponse,
} from "../../types.js";
import type { AppContext } from "../../context.js";

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
    const isPublic = c.req.header("x-blob-public") === "true";
    const contentType = c.req.header("content-type") || "application/octet-stream";

    if (!namespace || !key) {
      return c.json({ code: 400, message: "Missing x-blob-namespace or x-blob-key header" }, 400);
    }

    // Get the raw body
    const body = await c.req.arrayBuffer();
    const size = body.byteLength;

    if (size === 0) {
      return c.json({ code: 400, message: "Empty file" }, 400);
    }

    const kv = c.get("kv");
    const bucket = isPublic ? c.get("r2Public") : c.get("r2");
    const r2Key = `${namespace}:${key}`;

    // Upload to blob storage
    await bucket.put(r2Key, body, {
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
      isPublic,
    };

    const kvKey = `__BLOB:${namespace}:${key}`;
    await kv.put(kvKey, JSON.stringify(metadata));

    return c.json({ metadata });
  }
}

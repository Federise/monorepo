import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import {
  NamespaceValue,
  BlobVisibility,
  ErrorResponse,
} from "../../types.js";
import type { AppContext } from "../../context.js";
import { getOrCreateAlias } from "../../lib/namespace-alias.js";

const PresignUploadRequest = z.object({
  namespace: NamespaceValue,
  key: z.string(),
  contentType: z.string(),
  size: z.number().int().positive(),
  // Support both new visibility and legacy isPublic
  visibility: BlobVisibility.optional(),
  isPublic: z.boolean().optional(), // Legacy, maps to public/private
});

const PresignUploadResponse = z.object({
  uploadUrl: z.string().url(),
  expiresAt: z.string().datetime(),
});

export class BlobPresignUploadEndpoint extends OpenAPIRoute {
  schema = {
    tags: ["Blob Operations"],
    summary: "Get a presigned URL for direct upload to storage",
    security: [{ apiKey: [] }],
    request: {
      body: {
        content: { "application/json": { schema: PresignUploadRequest } },
      },
    },
    responses: {
      "200": {
        description: "Presigned URL generated successfully",
        content: { "application/json": { schema: PresignUploadResponse } },
      },
      "400": {
        description: "Bad request",
        content: { "application/json": { schema: ErrorResponse } },
      },
      "401": {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorResponse } },
      },
      "503": {
        description: "Presigning not configured",
        content: { "application/json": { schema: ErrorResponse } },
      },
    },
  };

  async handle(c: AppContext) {
    const presigner = c.get("presigner");
    const kv = c.get("kv");
    const config = c.get("config");

    // Check if presigner is configured
    if (!presigner) {
      return c.json(
        { code: 503, message: "Presigning not configured" },
        503
      );
    }

    const body = await c.req.json();
    const parsed = PresignUploadRequest.safeParse(body);
    if (!parsed.success) {
      return c.json({ code: "INVALID_REQUEST", message: "Invalid request body" }, 400);
    }

    const { namespace, key, contentType, size, visibility: visibilityParam, isPublic } = parsed.data;

    // Determine visibility: prefer explicit visibility, fall back to legacy isPublic
    const visibility = visibilityParam ?? (isPublic ? "public" : "private");

    const r2Key = `${namespace}:${key}`;

    // Generate presigned PUT URL (valid for 1 hour)
    // Use single bucket for all uploads
    const expiresIn = 3600;
    const uploadUrl = await presigner.getSignedUploadUrl(config.bucket, r2Key, {
      contentType,
      contentLength: size,
      expiresIn,
    });
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Pre-create metadata record (will be updated on successful upload confirmation)
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

    return c.json({ uploadUrl, expiresAt });
  }
}

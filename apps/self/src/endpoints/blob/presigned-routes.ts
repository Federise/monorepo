/**
 * Presigned Routes for Filesystem Mode
 *
 * These routes handle token-validated uploads and downloads for filesystem blob storage.
 * They provide S3-compatible presigned URL behavior without requiring external S3.
 */

import { Hono } from "hono";
import type { GatewayEnv } from "@federise/gateway-core";
import {
  validatePresignedUploadToken,
  validatePresignedDownloadToken,
} from "../../lib/signing.ts";

/**
 * Register presigned routes for filesystem mode.
 * These routes should be registered BEFORE auth middleware since they use token-based auth.
 */
export function registerPresignedRoutes(
  app: Hono<{ Variables: GatewayEnv }>,
  signingSecret: string
) {
  // Presigned PUT - handles direct uploads with a signed token
  app.put("/blob/presigned-put", async (c) => {
    const token = c.req.query("token");

    if (!token) {
      return c.json({ code: 400, message: "Missing token" }, 400);
    }

    // Validate token
    const payload = await validatePresignedUploadToken(token, signingSecret);
    if (!payload) {
      return c.json({ code: 401, message: "Invalid or expired token" }, 401);
    }

    // Validate content-type header matches token
    const contentType = c.req.header("content-type");
    if (contentType && contentType !== payload.contentType) {
      return c.json(
        { code: 400, message: `Content-Type mismatch: expected ${payload.contentType}` },
        400
      );
    }

    // Get the body
    const body = await c.req.arrayBuffer();

    // Validate content-length matches token
    if (body.byteLength !== payload.contentLength) {
      return c.json(
        { code: 400, message: `Content-Length mismatch: expected ${payload.contentLength}, got ${body.byteLength}` },
        400
      );
    }

    // Determine which bucket to use based on the bucket name in the token
    const isPublic = payload.bucket.includes("public");
    const bucket = isPublic ? c.get("r2Public") : c.get("r2");

    // Upload to blob storage
    await bucket.put(payload.key, body, {
      httpMetadata: {
        contentType: payload.contentType,
      },
    });

    // Return success (S3-compatible empty response)
    return c.body(null, 200);
  });

  // Presigned GET - handles direct downloads with a signed token
  app.get("/blob/presigned-get", async (c) => {
    const token = c.req.query("token");

    if (!token) {
      return c.json({ code: 400, message: "Missing token" }, 400);
    }

    // Validate token
    const payload = await validatePresignedDownloadToken(token, signingSecret);
    if (!payload) {
      return c.json({ code: 401, message: "Invalid or expired token" }, 401);
    }

    // Determine which bucket to use
    const isPublic = payload.bucket.includes("public");
    const bucket = isPublic ? c.get("r2Public") : c.get("r2");

    // Get the blob
    const object = await bucket.get(payload.key);
    if (!object) {
      return c.json({ code: 404, message: "Blob not found" }, 404);
    }

    // Stream the response with proper headers
    c.header("Content-Type", object.contentType || "application/octet-stream");
    c.header("Content-Length", String(object.size));

    return c.body(object.body, 200);
  });
}

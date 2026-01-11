import { Hono } from "hono";
import type { GatewayEnv } from "../../context.js";
import { verifyDownloadUrl } from "../../lib/hmac.js";
import { resolveNamespace } from "../../lib/namespace-alias.js";
import type { BlobVisibility } from "../../types.js";

/**
 * Public blob download route.
 *
 * Handles downloads for public and presigned files without requiring API key auth.
 * Route: GET /blob/f/:namespace/:key
 *
 * Access control:
 * - public: No auth required, direct access
 * - presigned: Requires valid HMAC signature and non-expired timestamp
 * - private: Returns 401, must use /blob/download with API key
 */
export function registerPublicBlobRoute(app: Hono<{ Variables: GatewayEnv }>) {
  app.get("/blob/f/:namespace/:key", async (c) => {
    const namespaceOrAlias = c.req.param("namespace");
    const key = c.req.param("key");
    const sig = c.req.query("sig");
    const exp = c.req.query("exp");

    if (!namespaceOrAlias || !key) {
      return c.json({ code: 400, message: "Missing namespace or key" }, 400);
    }

    const kv = c.get("kv");
    const config = c.get("config");

    // Resolve alias to full namespace (if it's an alias)
    const namespace = await resolveNamespace(kv, namespaceOrAlias);
    if (!namespace) {
      return c.json({ code: 404, message: "Namespace not found" }, 404);
    }

    // Get metadata from KV
    const kvKey = `__BLOB:${namespace}:${key}`;
    const metadataStr = await kv.get(kvKey);

    if (!metadataStr) {
      return c.json({ code: 404, message: "Blob not found" }, 404);
    }

    const metadata = JSON.parse(metadataStr);

    // Handle legacy isPublic field
    const visibility: BlobVisibility = metadata.visibility ??
      (metadata.isPublic ? "public" : "private");

    // Check access based on visibility
    if (visibility === "public") {
      // Public access - no auth needed
    } else if (visibility === "presigned" || (sig && exp)) {
      // Presigned - validate signature
      if (!sig || !exp) {
        return c.json(
          { code: 401, message: "Signature and expiration required" },
          401
        );
      }

      const expiresAt = parseInt(exp, 10);
      if (isNaN(expiresAt)) {
        return c.json({ code: 400, message: "Invalid expiration" }, 400);
      }

      // Check expiration
      if (Date.now() / 1000 > expiresAt) {
        return c.json({ code: 401, message: "Link expired" }, 401);
      }

      // Verify signature (use URL param, not resolved namespace - signature was created with alias)
      const valid = await verifyDownloadUrl(
        { namespace: namespaceOrAlias, key, expiresAt },
        sig,
        config.signingSecret
      );

      if (!valid) {
        return c.json({ code: 401, message: "Invalid signature" }, 401);
      }
    } else {
      // Private - reject, must use /blob/download with API key
      return c.json(
        { code: 401, message: "Authentication required. Use /blob/download with API key." },
        401
      );
    }

    // Serve the file
    const blob = c.get("blob");
    const r2Key = `${namespace}:${key}`;
    const object = await blob.get(r2Key);

    if (!object) {
      return c.json({ code: 404, message: "Blob not found in storage" }, 404);
    }

    // Build response headers
    const headers = new Headers();
    headers.set("Content-Type", metadata.contentType || "application/octet-stream");
    headers.set("Content-Length", String(metadata.size));

    // Use inline for viewable content, attachment for downloads
    const isViewable = isViewableContentType(metadata.contentType);
    const disposition = isViewable ? "inline" : "attachment";
    headers.set("Content-Disposition", `${disposition}; filename="${encodeURIComponent(key)}"`);

    // No cache for now (can add caching for public files later)
    headers.set("Cache-Control", "no-store");

    return new Response(object.body, {
      status: 200,
      headers,
    });
  });
}

/**
 * Check if content type should be displayed inline vs downloaded.
 */
function isViewableContentType(contentType: string): boolean {
  if (!contentType) return false;

  const viewableTypes = [
    "image/",
    "video/",
    "audio/",
    "text/",
    "application/pdf",
    "application/json",
  ];

  return viewableTypes.some((type) => contentType.startsWith(type));
}

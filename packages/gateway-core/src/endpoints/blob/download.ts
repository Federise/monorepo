import { Hono } from "hono";
import type { GatewayEnv } from "../../context.js";
import { resolveNamespace } from "../../lib/namespace-alias.js";

/**
 * Authenticated blob download route.
 *
 * This route requires API key authentication (handled by auth middleware).
 * Use this for private file access with full credentials.
 *
 * For public/presigned access without API key, use /blob/f/:namespace/:key
 */
export function registerBlobDownloadRoute(app: Hono<{ Variables: GatewayEnv }>) {
  app.get("/blob/download/:namespace/:key", async (c) => {
    const namespaceOrAlias = c.req.param("namespace");
    const key = c.req.param("key");

    if (!namespaceOrAlias || !key) {
      return c.json({ code: 400, message: "Missing namespace or key" }, 400);
    }

    const kv = c.get("kv");

    // Resolve alias to full namespace (if it's an alias)
    const namespace = await resolveNamespace(kv, namespaceOrAlias);
    if (!namespace) {
      return c.json({ code: 404, message: "Namespace not found" }, 404);
    }

    // Get metadata from KV to check if blob exists and get content type
    const kvKey = `__BLOB:${namespace}:${key}`;
    const metadataStr = await kv.get(kvKey);

    if (!metadataStr) {
      return c.json({ code: 404, message: "Blob not found" }, 404);
    }

    const metadata = JSON.parse(metadataStr);
    const r2Key = `${namespace}:${key}`;

    // Use single bucket
    const blob = c.get("blob");

    // Get the object from storage
    const object = await blob.get(r2Key);

    if (!object) {
      return c.json({ code: 404, message: "Blob not found in storage" }, 404);
    }

    // Stream the response
    const headers = new Headers();
    headers.set("Content-Type", metadata.contentType || "application/octet-stream");
    headers.set("Content-Length", String(metadata.size));
    headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(key)}"`);

    return new Response(object.body, {
      status: 200,
      headers,
    });
  });
}

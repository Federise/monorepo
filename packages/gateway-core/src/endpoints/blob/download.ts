import { Hono } from "hono";
import type { GatewayEnv } from "../../context.js";

// This is a raw Hono route, not OpenAPI, since we're streaming binary data
export function registerBlobDownloadRoute(app: Hono<{ Variables: GatewayEnv }>) {
  app.get("/blob/download/:namespace/:key", async (c) => {
    const namespace = c.req.param("namespace");
    const key = c.req.param("key");

    if (!namespace || !key) {
      return c.json({ code: 400, message: "Missing namespace or key" }, 400);
    }

    const kv = c.get("kv");

    // Get metadata from KV to check if blob exists and get content type
    const kvKey = `__BLOB:${namespace}:${key}`;
    const metadataStr = await kv.get(kvKey);

    if (!metadataStr) {
      return c.json({ code: 404, message: "Blob not found" }, 404);
    }

    const metadata = JSON.parse(metadataStr);
    const r2Key = `${namespace}:${key}`;

    // Select the appropriate bucket
    const bucket = metadata.isPublic ? c.get("r2Public") : c.get("r2");

    // Get the object from storage
    const object = await bucket.get(r2Key);

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

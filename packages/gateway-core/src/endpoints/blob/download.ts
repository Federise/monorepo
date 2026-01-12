import { Hono, type Context } from "hono";
import type { GatewayEnv } from "../../context.js";
import { resolveNamespace } from "../../lib/namespace-alias.js";
import { generateRequestId, addObservabilityHeaders } from "../../lib/observability.js";
import type { BlobGetOptions } from "../../adapters/blob.js";

type AppContext = Context<{ Variables: GatewayEnv }>;

/**
 * Authenticated blob download route.
 *
 * This route requires API key authentication (handled by auth middleware).
 * Use this for private file access with full credentials.
 *
 * When presigner is configured, redirects to presigned R2 URL.
 * Otherwise falls back to proxying through the worker.
 *
 * For public/presigned access without API key, use /blob/f/:namespace/:key
 */
export function registerBlobDownloadRoute(app: Hono<{ Variables: GatewayEnv }>) {
  app.get("/blob/download/:namespace/:key", async (c) => {
    const requestId = generateRequestId();
    const namespaceOrAlias = c.req.param("namespace");
    const key = c.req.param("key");

    if (!namespaceOrAlias || !key) {
      return c.json({ code: 400, message: "Missing namespace or key" }, 400);
    }

    const kv = c.get("kv");
    const config = c.get("config");
    const presigner = c.get("presigner");

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

    // If presigner is configured, redirect to presigned R2 URL
    if (presigner) {
      const expiresIn = config.presignExpiresIn || 3600;

      try {
        const presignedUrl = await presigner.getSignedDownloadUrl(
          config.bucket,
          r2Key,
          { expiresIn }
        );

        // Build redirect response with observability headers
        const headers = new Headers();
        addObservabilityHeaders(headers, {
          requestId,
          action: "redirect",
          visibility: "private",
          presignExpiry: expiresIn,
        });

        // Don't cache authenticated downloads
        headers.set("Cache-Control", "private, no-store");
        headers.set("Location", presignedUrl);

        return new Response(null, {
          status: 302,
          headers,
        });
      } catch (error) {
        // If presigning fails, fall back to proxy
        console.error("Presign failed, falling back to proxy:", error);
      }
    }

    // Fallback: proxy through worker (for self-hosted without S3 creds)
    return proxyFromBlob(c, r2Key, key, metadata, requestId);
  });
}

/**
 * Fallback: Proxy file through worker when presigner is not available.
 */
async function proxyFromBlob(
  c: AppContext,
  r2Key: string,
  key: string,
  metadata: { size: number; contentType?: string },
  requestId: string
) {
  const blob = c.get("blob");
  const totalSize = metadata.size;

  // Parse Range header for partial content requests
  const rangeHeader = c.req.header("Range");
  const range = rangeHeader ? parseRangeHeader(rangeHeader, totalSize) : null;

  // Build blob get options with range if present
  const blobOptions: BlobGetOptions = {};
  if (range) {
    blobOptions.range = {
      offset: range.start,
      length: range.end - range.start + 1,
    };
  }

  // Get the object from storage
  const object = await blob.get(r2Key, blobOptions);

  if (!object) {
    return c.json({ code: 404, message: "Blob not found in storage" }, 404);
  }

  // Stream the response
  const headers = new Headers();
  headers.set("Content-Type", metadata.contentType || "application/octet-stream");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(key)}"`);

  // Add observability headers
  addObservabilityHeaders(headers, {
    requestId,
    action: "proxy",
    visibility: "private",
  });

  // Add ETag for caching validation
  if (object.etag) {
    headers.set("ETag", object.etag);
  }

  // Handle range request (206 Partial Content)
  if (range) {
    const contentLength = range.end - range.start + 1;
    headers.set("Content-Length", String(contentLength));
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${totalSize}`);

    return new Response(object.body, {
      status: 206,
      headers,
    });
  }

  // Full content (200 OK)
  headers.set("Content-Length", String(totalSize));

  return new Response(object.body, {
    status: 200,
    headers,
  });
}

/**
 * Parse HTTP Range header for partial content requests.
 */
function parseRangeHeader(
  rangeHeader: string,
  totalSize: number
): { start: number; end: number } | null {
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;

  const [, startStr, endStr] = match;

  let start: number;
  let end: number;

  if (startStr === "" && endStr !== "") {
    const suffix = parseInt(endStr, 10);
    start = Math.max(0, totalSize - suffix);
    end = totalSize - 1;
  } else if (startStr !== "" && endStr === "") {
    start = parseInt(startStr, 10);
    end = totalSize - 1;
  } else if (startStr !== "" && endStr !== "") {
    start = parseInt(startStr, 10);
    end = Math.min(parseInt(endStr, 10), totalSize - 1);
  } else {
    return null;
  }

  if (start > end || start >= totalSize || start < 0) {
    return null;
  }

  return { start, end };
}

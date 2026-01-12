import { Hono, type Context } from "hono";
import type { GatewayEnv } from "../../context.js";
import { verifyDownloadUrl } from "../../lib/hmac.js";
import { resolveNamespace } from "../../lib/namespace-alias.js";
import { generateRequestId, addObservabilityHeaders } from "../../lib/observability.js";
import type { BlobVisibility } from "../../types.js";
import type { BlobGetOptions } from "../../adapters/blob.js";

type AppContext = Context<{ Variables: GatewayEnv }>;

// Max presigned URL expiry for R2/S3 is 7 days
const PUBLIC_PRESIGN_EXPIRY = 604800;

/**
 * Public blob download route.
 *
 * Handles downloads for public and presigned files without requiring API key auth.
 * Route: GET /blob/f/:namespace/:key
 *
 * Access control:
 * - public: No auth required, redirects to presigned R2 URL (7 day expiry)
 * - presigned: Requires valid HMAC signature, redirects to presigned R2 URL
 * - private: Returns 401, must use /blob/download with API key
 *
 * When presigner is not configured (self-hosted), falls back to proxying.
 */
export function registerPublicBlobRoute(app: Hono<{ Variables: GatewayEnv }>) {
  app.get("/blob/f/:namespace/:key", async (c) => {
    const requestId = generateRequestId();
    const namespaceOrAlias = c.req.param("namespace");
    const key = c.req.param("key");
    const sig = c.req.query("sig");
    const exp = c.req.query("exp");

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

    const r2Key = `${namespace}:${key}`;

    // If presigner is configured, redirect to storage URL
    if (presigner) {
      // For public files, try direct custom domain URL first (cleaner, no signing needed)
      if (visibility === "public" && presigner.getPublicUrl) {
        const publicUrl = presigner.getPublicUrl(config.bucket, r2Key);
        if (publicUrl) {
          const headers = new Headers();
          addObservabilityHeaders(headers, { requestId, action: "redirect", visibility });
          headers.set("Cache-Control", "public, max-age=31536000, immutable");
          headers.set("Location", publicUrl);
          return new Response(null, { status: 302, headers });
        }
      }

      // Fall back to presigned URL
      const expiresIn = visibility === "public"
        ? PUBLIC_PRESIGN_EXPIRY  // 7 days for public (max allowed)
        : config.presignExpiresIn || 3600;  // configurable for presigned

      try {
        const presignedUrl = await presigner.getSignedDownloadUrl(
          config.bucket,
          r2Key,
          { expiresIn }
        );

        const headers = new Headers();
        addObservabilityHeaders(headers, {
          requestId,
          action: "redirect",
          visibility,
          presignExpiry: expiresIn,
        });

        if (visibility === "public") {
          headers.set("Cache-Control", `public, max-age=${expiresIn}`);
        } else {
          headers.set("Cache-Control", "private, no-store");
        }

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
    return proxyFromBlob(c, r2Key, metadata, visibility, requestId);
  });
}

/**
 * Fallback: Proxy file through worker when presigner is not available.
 * Used for self-hosted deployments without S3 API credentials.
 */
async function proxyFromBlob(
  c: AppContext,
  r2Key: string,
  metadata: { size: number; contentType?: string },
  visibility: BlobVisibility,
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

  const object = await blob.get(r2Key, blobOptions);

  if (!object) {
    return c.json({ code: 404, message: "Blob not found in storage" }, 404);
  }

  // Build response headers
  const headers = new Headers();
  headers.set("Content-Type", metadata.contentType || "application/octet-stream");

  // Enable range requests for streaming media
  headers.set("Accept-Ranges", "bytes");

  // Add observability headers
  addObservabilityHeaders(headers, {
    requestId,
    action: "proxy",
    visibility,
  });

  // Use inline for viewable content, attachment for downloads
  const isViewable = isViewableContentType(metadata.contentType);
  const disposition = isViewable ? "inline" : "attachment";
  const key = r2Key.split(":").pop() || r2Key;
  headers.set("Content-Disposition", `${disposition}; filename="${encodeURIComponent(key)}"`);

  // Cache public files at edge, don't cache presigned (they expire)
  if (visibility === "public") {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    headers.set("Cache-Control", "private, no-store");
  }

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
 * Check if content type should be displayed inline vs downloaded.
 */
function isViewableContentType(contentType?: string): boolean {
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

/**
 * Parse HTTP Range header for partial content requests.
 * Supports format: "bytes=start-end" or "bytes=start-" or "bytes=-suffix"
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
    // Suffix range: "bytes=-500" means last 500 bytes
    const suffix = parseInt(endStr, 10);
    start = Math.max(0, totalSize - suffix);
    end = totalSize - 1;
  } else if (startStr !== "" && endStr === "") {
    // Open-ended: "bytes=500-" means from 500 to end
    start = parseInt(startStr, 10);
    end = totalSize - 1;
  } else if (startStr !== "" && endStr !== "") {
    // Explicit range: "bytes=0-499"
    start = parseInt(startStr, 10);
    end = Math.min(parseInt(endStr, 10), totalSize - 1);
  } else {
    return null;
  }

  // Validate range
  if (start > end || start >= totalSize || start < 0) {
    return null;
  }

  return { start, end };
}

import { Hono } from "hono";
import type { GatewayEnv } from "../../context.js";
import { verifyLogToken } from "../../lib/log-token.js";

/**
 * Register middleware for token-based log authentication.
 *
 * These middleware run BEFORE the auth middleware to allow
 * recipients to access logs using capability tokens without API keys.
 *
 * If X-Log-Token header is present, the request is handled here.
 * If not, the request passes through to the normal auth middleware.
 */
export function registerTokenLogRoutes(app: Hono<{ Variables: GatewayEnv }>) {
  // Log read with token auth
  app.use("/log/read", async (c, next) => {
    const tokenHeader = c.req.header("X-Log-Token");

    // If no token, pass through to auth middleware
    if (!tokenHeader) {
      return next();
    }

    const kv = c.get("kv");

    let body: { logId: string; afterSeq?: number; limit?: number };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ code: 400, message: "Invalid JSON body" }, 400);
    }

    const { logId, afterSeq = 0, limit = 50 } = body;

    if (!logId) {
      return c.json({ code: 400, message: "Missing logId" }, 400);
    }

    // Get log metadata to retrieve secret
    const metaStr = await kv.get(`__LOG:${logId}:meta`);
    if (!metaStr) {
      return c.json({ code: 404, message: "Log not found" }, 404);
    }
    const meta = JSON.parse(metaStr);

    // Verify token
    const verified = await verifyLogToken(tokenHeader, meta.secret);
    if (!verified) {
      return c.json({ code: 401, message: "Invalid or expired token" }, 401);
    }
    if (!verified.permissions.includes("read")) {
      return c.json({ code: 403, message: "Token lacks read permission" }, 403);
    }

    // Build prefix for events after the given sequence
    const prefix = `__LOG:${logId}:events:`;

    // List all event keys
    const result = await kv.list({ prefix, limit: limit + 1 });

    // Filter to events after afterSeq and fetch their values
    const events = [];
    let hasMore = false;

    for (const key of result.keys) {
      // Extract sequence from key
      const seqStr = key.name.replace(prefix, "");
      const seq = parseInt(seqStr, 10);

      if (seq > afterSeq) {
        if (events.length >= limit) {
          hasMore = true;
          break;
        }

        const value = await kv.get(key.name);
        if (value) {
          events.push(JSON.parse(value));
        }
      }
    }

    return c.json({ events, hasMore });
  });

  // Log append with token auth
  app.use("/log/append", async (c, next) => {
    const tokenHeader = c.req.header("X-Log-Token");

    // If no token, pass through to auth middleware
    if (!tokenHeader) {
      return next();
    }

    const kv = c.get("kv");

    let body: { logId: string; content: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ code: 400, message: "Invalid JSON body" }, 400);
    }

    const { logId, content } = body;

    if (!logId || !content) {
      return c.json({ code: 400, message: "Missing logId or content" }, 400);
    }

    // Get log metadata to retrieve secret
    const metaStr = await kv.get(`__LOG:${logId}:meta`);
    if (!metaStr) {
      return c.json({ code: 404, message: "Log not found" }, 404);
    }
    const meta = JSON.parse(metaStr);

    // Verify token
    const verified = await verifyLogToken(tokenHeader, meta.secret);
    if (!verified) {
      return c.json({ code: 401, message: "Invalid or expired token" }, 401);
    }
    if (!verified.permissions.includes("write")) {
      return c.json({ code: 403, message: "Token lacks write permission" }, 403);
    }

    // Get next sequence number
    const seqKey = `__LOG:${logId}:seq`;
    const seqStr = await kv.get(seqKey);
    const nextSeq = seqStr ? parseInt(seqStr, 10) + 1 : 1;

    // Create event
    const event = {
      id: crypto.randomUUID(),
      seq: nextSeq,
      authorId: verified.authorId,
      content,
      createdAt: new Date().toISOString(),
    };

    // Store event and update sequence atomically
    const paddedSeq = String(nextSeq).padStart(10, "0");
    await kv.put(`__LOG:${logId}:events:${paddedSeq}`, JSON.stringify(event));
    await kv.put(seqKey, String(nextSeq));

    return c.json({ event });
  });
}

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

    const logStore = c.get("logStore");

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
    const meta = await logStore.getMetadata(logId);
    if (!meta) {
      return c.json({ code: 404, message: "Log not found" }, 404);
    }

    // Verify token
    const verified = await verifyLogToken(tokenHeader, meta.secret);
    if (!verified) {
      return c.json({ code: 401, message: "Invalid or expired token" }, 401);
    }
    if (!verified.permissions.includes("read")) {
      return c.json({ code: 403, message: "Token lacks read permission" }, 403);
    }

    // Read events from Durable Object
    const result = await logStore.read(logId, { afterSeq, limit });

    return c.json(result);
  });

  // Log append with token auth
  app.use("/log/append", async (c, next) => {
    const tokenHeader = c.req.header("X-Log-Token");

    // If no token, pass through to auth middleware
    if (!tokenHeader) {
      return next();
    }

    const logStore = c.get("logStore");

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
    const meta = await logStore.getMetadata(logId);
    if (!meta) {
      return c.json({ code: 404, message: "Log not found" }, 404);
    }

    // Verify token
    const verified = await verifyLogToken(tokenHeader, meta.secret);
    if (!verified) {
      return c.json({ code: 401, message: "Invalid or expired token" }, 401);
    }
    if (!verified.permissions.includes("write")) {
      return c.json({ code: 403, message: "Token lacks write permission" }, 403);
    }

    // Append event atomically via Durable Object
    const event = await logStore.append(logId, {
      authorId: verified.authorId,
      content,
    });

    return c.json({ event });
  });
}

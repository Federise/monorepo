import { Hono } from "hono";
import type { GatewayEnv } from "../../context.js";
import { verifyChannelToken } from "../../lib/channel-token.js";

/**
 * Register middleware for token-based channel authentication.
 *
 * These middleware run BEFORE the auth middleware to allow
 * recipients to access channels using capability tokens without API keys.
 *
 * If X-Channel-Token header is present, the request is handled here.
 * If not, the request passes through to the normal auth middleware.
 */
export function registerTokenChannelRoutes(app: Hono<{ Variables: GatewayEnv }>) {
  // Channel read with token auth
  app.use("/channel/read", async (c, next) => {
    const tokenHeader = c.req.header("X-Channel-Token");

    // If no token, pass through to auth middleware
    if (!tokenHeader) {
      return next();
    }

    const channelStore = c.get("channelStore");

    let body: { channelId: string; afterSeq?: number; limit?: number };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ code: 400, message: "Invalid JSON body" }, 400);
    }

    const { channelId, afterSeq = 0, limit = 50 } = body;

    if (!channelId) {
      return c.json({ code: 400, message: "Missing channelId" }, 400);
    }

    // Get channel metadata to retrieve secret
    const meta = await channelStore.getMetadata(channelId);
    if (!meta) {
      return c.json({ code: 404, message: "Channel not found" }, 404);
    }

    // Verify token
    const verified = await verifyChannelToken(tokenHeader, meta.secret);
    if (!verified) {
      return c.json({ code: 401, message: "Invalid or expired token" }, 401);
    }
    if (!verified.permissions.includes("read")) {
      return c.json({ code: 403, message: "Token lacks read permission" }, 403);
    }

    // Check if user has read:deleted permission
    const includeDeleted = verified.permissions.includes("read:deleted");

    // Read events from Durable Object
    const result = await channelStore.read(channelId, { afterSeq, limit, includeDeleted });

    return c.json(result);
  });

  // Channel append with token auth
  app.use("/channel/append", async (c, next) => {
    const tokenHeader = c.req.header("X-Channel-Token");

    // If no token, pass through to auth middleware
    if (!tokenHeader) {
      return next();
    }

    const channelStore = c.get("channelStore");

    let body: { channelId: string; content: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ code: 400, message: "Invalid JSON body" }, 400);
    }

    const { channelId, content } = body;

    if (!channelId || !content) {
      return c.json({ code: 400, message: "Missing channelId or content" }, 400);
    }

    // Get channel metadata to retrieve secret
    const meta = await channelStore.getMetadata(channelId);
    if (!meta) {
      return c.json({ code: 404, message: "Channel not found" }, 404);
    }

    // Verify token
    const verified = await verifyChannelToken(tokenHeader, meta.secret);
    if (!verified) {
      return c.json({ code: 401, message: "Invalid or expired token" }, 401);
    }
    if (!verified.permissions.includes("append")) {
      return c.json({ code: 403, message: "Token lacks append permission" }, 403);
    }

    // Append event atomically via Durable Object
    const event = await channelStore.append(channelId, {
      authorId: verified.authorId,
      content,
    });

    return c.json({ event });
  });

  // Channel delete-event with token auth
  app.use("/channel/delete-event", async (c, next) => {
    const tokenHeader = c.req.header("X-Channel-Token");

    // If no token, pass through to auth middleware
    if (!tokenHeader) {
      return next();
    }

    const channelStore = c.get("channelStore");

    let body: { channelId: string; targetSeq: number };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ code: 400, message: "Invalid JSON body" }, 400);
    }

    const { channelId, targetSeq } = body;

    if (!channelId || targetSeq === undefined) {
      return c.json({ code: 400, message: "Missing channelId or targetSeq" }, 400);
    }

    // Get channel metadata to retrieve secret
    const meta = await channelStore.getMetadata(channelId);
    if (!meta) {
      return c.json({ code: 404, message: "Channel not found" }, 404);
    }

    // Verify token
    const verified = await verifyChannelToken(tokenHeader, meta.secret);
    if (!verified) {
      return c.json({ code: 401, message: "Invalid or expired token" }, 401);
    }

    // Check for delete permissions
    const hasDeleteOwn = verified.permissions.includes("delete:own");
    const hasDeleteAny = verified.permissions.includes("delete:any");

    if (!hasDeleteOwn && !hasDeleteAny) {
      return c.json({ code: 403, message: "Token lacks delete permission" }, 403);
    }

    // Get the target event to check ownership
    const targetEvent = await channelStore.getEvent(channelId, targetSeq);
    if (!targetEvent) {
      return c.json({ code: 404, message: "Event not found" }, 404);
    }

    // Check ownership if user only has delete:own permission
    if (!hasDeleteAny && targetEvent.authorId !== verified.authorId) {
      return c.json({ code: 403, message: "Can only delete own events" }, 403);
    }

    // Append deletion marker
    const event = await channelStore.appendDeletion(channelId, {
      authorId: verified.authorId,
      targetSeq,
    });

    return c.json({ event });
  });
}

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { GatewayEnv } from "../../context.js";
import { verifyChannelToken } from "../../lib/channel-token.js";

/**
 * Register SSE subscription endpoint for real-time channel updates.
 *
 * Accepts token authentication via query parameter or header.
 * Streams new events as they arrive using Server-Sent Events.
 */
export function registerChannelSubscribeRoute(app: Hono<{ Variables: GatewayEnv }>) {
  app.get("/channel/subscribe", async (c) => {
    const channelStore = c.get("channelStore");

    // Get token from query or header
    const token = c.req.query("token") || c.req.header("X-Channel-Token");
    if (!token) {
      return c.json({ code: "UNAUTHORIZED", message: "Token required" }, 401);
    }

    // Get channelId from query
    const channelId = c.req.query("channelId");
    if (!channelId) {
      return c.json({ code: "INVALID_REQUEST", message: "channelId required" }, 400);
    }

    // Get channel metadata to retrieve secret
    const meta = await channelStore.getMetadata(channelId);
    if (!meta) {
      return c.json({ code: "NOT_FOUND", message: "Channel not found" }, 404);
    }

    // Verify token
    const verified = await verifyChannelToken(token, meta.secret);
    if (!verified) {
      return c.json({ code: "UNAUTHORIZED", message: "Invalid or expired token" }, 401);
    }
    if (!verified.permissions.includes("read")) {
      return c.json({ code: "FORBIDDEN", message: "Token lacks read permission" }, 403);
    }

    // Get optional afterSeq from query
    let lastSeq = parseInt(c.req.query("afterSeq") || "0", 10);

    // Start SSE stream
    return streamSSE(c, async (stream) => {
      // Send initial connection event
      await stream.writeSSE({
        event: "connected",
        data: JSON.stringify({ channelId, afterSeq: lastSeq }),
      });

      // Poll interval (1 second for more responsive updates)
      const pollIntervalMs = 1000;
      let isActive = true;

      // Handle client disconnect
      stream.onAbort(() => {
        isActive = false;
      });

      // Polling loop
      while (isActive) {
        try {
          const result = await channelStore.read(channelId, { afterSeq: lastSeq, limit: 50 });

          for (const event of result.events) {
            await stream.writeSSE({
              event: "message",
              data: JSON.stringify(event),
              id: String(event.seq),
            });
            lastSeq = event.seq;
          }
        } catch (err) {
          // Log error but keep connection alive
          console.error("SSE poll error:", err);
        }

        // Wait before next poll
        await stream.sleep(pollIntervalMs);
      }
    });
  });
}

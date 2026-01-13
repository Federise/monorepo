import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { GatewayEnv } from "../../context.js";
import { verifyLogToken } from "../../lib/log-token.js";

/**
 * Register SSE subscription endpoint for real-time log updates.
 *
 * Accepts token authentication via query parameter or header.
 * Streams new events as they arrive using Server-Sent Events.
 */
export function registerLogSubscribeRoute(app: Hono<{ Variables: GatewayEnv }>) {
  app.get("/log/subscribe", async (c) => {
    const logStore = c.get("logStore");

    // Get token from query or header
    const token = c.req.query("token") || c.req.header("X-Log-Token");
    if (!token) {
      return c.json({ code: 401, message: "Token required" }, 401);
    }

    // Get logId from query
    const logId = c.req.query("logId");
    if (!logId) {
      return c.json({ code: 400, message: "logId required" }, 400);
    }

    // Get log metadata to retrieve secret
    const meta = await logStore.getMetadata(logId);
    if (!meta) {
      return c.json({ code: 404, message: "Log not found" }, 404);
    }

    // Verify token
    const verified = await verifyLogToken(token, meta.secret);
    if (!verified) {
      return c.json({ code: 401, message: "Invalid or expired token" }, 401);
    }
    if (!verified.permissions.includes("read")) {
      return c.json({ code: 403, message: "Token lacks read permission" }, 403);
    }

    // Get optional afterSeq from query
    let lastSeq = parseInt(c.req.query("afterSeq") || "0", 10);

    // Start SSE stream
    return streamSSE(c, async (stream) => {
      // Send initial connection event
      await stream.writeSSE({
        event: "connected",
        data: JSON.stringify({ logId, afterSeq: lastSeq }),
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
          const result = await logStore.read(logId, { afterSeq: lastSeq, limit: 50 });

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

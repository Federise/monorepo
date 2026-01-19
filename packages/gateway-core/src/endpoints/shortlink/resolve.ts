import type { Hono } from "hono";
import type { GatewayEnv } from "../../context.js";

/**
 * Register the short link resolve route.
 * This must be registered BEFORE auth middleware as it's a public endpoint.
 */
export function registerShortLinkResolveRoute<T extends { Variables: GatewayEnv }>(
  app: Hono<T>
) {
  app.get("/s/:id", async (c) => {
    const id = c.req.param("id");
    const shortLink = c.get("shortLink");

    const link = await shortLink.resolve(id);
    if (!link) {
      return c.json({ code: "NOT_FOUND", message: "Short link not found" }, 404);
    }

    return c.redirect(link.targetUrl, 302);
  });
}

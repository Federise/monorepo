import type { Next } from "hono";
import { hashApiKey } from "../lib/crypto.js";
import type { AppContext } from "../context.js";
import { getKV, getConfig } from "../context.js";

/**
 * Options for the auth middleware
 */
export interface AuthMiddlewareOptions {
  /**
   * If true, allows bootstrap API key to access /admin/* endpoints.
   * This is used by self-hosted deployments for admin diagnostics.
   */
  allowBootstrapAdmin?: boolean;
}

/**
 * Creates an auth middleware with the given options.
 */
export function createAuthMiddleware(options: AuthMiddlewareOptions = {}) {
  return async function authMiddleware(c: AppContext, next: Next) {
    // Skip authentication for OpenAPI documentation
    if (c.req.path.startsWith("/openapi")) {
      await next();
      return;
    }

    const config = getConfig(c);
    const auth = c.req.header("authorization");

    if (!auth || !auth.match(/^ApiKey [a-zA-Z0-9_-]+$/)) {
      return c.json({ code: 401, message: "Invalid authorization header" }, 401);
    }

    const apiKey = auth.replace("ApiKey ", "");
    const kv = getKV(c);

    // Check if using bootstrap key
    if (config.bootstrapApiKey && apiKey === config.bootstrapApiKey) {
      // Admin endpoints accept bootstrap key if allowed
      if (options.allowBootstrapAdmin && c.req.path.startsWith("/admin/")) {
        await next();
        return;
      }

      // Principal create only when no principals exist
      if (c.req.path.startsWith("/principal/create")) {
        const list = await kv.list({ prefix: "__PRINCIPAL:" });
        if (list.keys.length === 0) {
          await next();
          return;
        }
      }

      // Bootstrap key not valid for this path
      return c.json({ code: 401, message: "Unauthorized" }, 401);
    }

    // Check regular principal auth
    const apiKeyHash = await hashApiKey(apiKey);
    const val = await kv.get(`__PRINCIPAL:${apiKeyHash}`);

    if (!val) {
      return c.json({ code: 401, message: "Unauthorized" }, 401);
    }

    let principal: { active: boolean };
    try {
      principal = JSON.parse(val);
    } catch {
      return c.json({ code: 401, message: "Unauthorized" }, 401);
    }

    if (!principal.active) {
      return c.json({ code: 401, message: "Unauthorized" }, 401);
    }

    await next();
  };
}

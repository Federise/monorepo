import type { Next } from "hono";
import { hashApiKey } from "../lib/crypto.js";
import type { AppContext } from "../context.js";
import { getKV, getConfig } from "../context.js";
import type { Credential } from "../lib/credential.js";
import type { Identity } from "../lib/identity.js";
import { CredentialStatus } from "../lib/credential.js";
import { IdentityStatus } from "../lib/identity.js";

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
 * Context added by auth middleware
 */
export interface AuthContext {
  identity?: Identity;
  credential?: Credential;
}

/**
 * Creates an auth middleware with the given options.
 */
export function createAuthMiddleware(options: AuthMiddlewareOptions = {}) {
  return async function authMiddleware(c: AppContext, next: Next) {
    // Skip authentication for public endpoints
    const publicPaths = [
      "/openapi",
      "/ping",
      "/token/lookup",
      "/token/claim",
    ];

    if (publicPaths.some((path) => c.req.path.startsWith(path))) {
      await next();
      return;
    }

    const config = getConfig(c);
    const auth = c.req.header("authorization");

    if (!auth || !auth.match(/^ApiKey [a-zA-Z0-9_-]+$/)) {
      return c.json({ code: "UNAUTHORIZED", message: "Invalid authorization header" }, 401);
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

      // Identity create only when no identities exist
      if (c.req.path.startsWith("/identity/create")) {
        const list = await kv.list({ prefix: "__IDENTITY:" });
        if (list.keys.length === 0) {
          await next();
          return;
        }
      }

      // Bootstrap key not valid for this path
      return c.json({ code: "UNAUTHORIZED", message: "Unauthorized" }, 401);
    }

    // Look up credential by secret hash
    const secretHash = await hashApiKey(apiKey);
    const credentialVal = await kv.get(`__CREDENTIAL:${secretHash}`);

    if (!credentialVal) {
      return c.json({ code: "UNAUTHORIZED", message: "Unauthorized" }, 401);
    }

    let credential: Credential;
    try {
      credential = JSON.parse(credentialVal);
    } catch {
      return c.json({ code: "UNAUTHORIZED", message: "Unauthorized" }, 401);
    }

    // Check credential status
    if (credential.status === CredentialStatus.REVOKED) {
      return c.json({ code: "UNAUTHORIZED", message: "Credential revoked" }, 401);
    }

    // Check credential expiry
    if (credential.expiresAt) {
      const expiresAt = new Date(credential.expiresAt).getTime();
      if (Date.now() > expiresAt) {
        return c.json({ code: "UNAUTHORIZED", message: "Credential expired" }, 401);
      }
    }

    // Look up identity
    const identityVal = await kv.get(`__IDENTITY:${credential.identityId}`);
    if (!identityVal) {
      return c.json({ code: "UNAUTHORIZED", message: "Identity not found" }, 401);
    }

    let identity: Identity;
    try {
      identity = JSON.parse(identityVal);
    } catch {
      return c.json({ code: "UNAUTHORIZED", message: "Unauthorized" }, 401);
    }

    // Check identity status
    if (identity.status !== IdentityStatus.ACTIVE) {
      return c.json({ code: "UNAUTHORIZED", message: "Identity not active" }, 401);
    }

    // Store auth context for downstream handlers
    c.set("identity", identity);
    c.set("credential", credential);

    await next();
  };
}

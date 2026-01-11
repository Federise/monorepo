import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  createAuthMiddleware,
  registerGatewayRoutes,
  registerBlobDownloadRoute,
  type GatewayEnv,
} from "@federise/gateway-core";
import { CloudflareKVAdapter } from "./adapters/cloudflare-kv";
import { CloudflareR2Adapter } from "./adapters/cloudflare-r2";
import { CloudflarePresigner } from "./adapters/cloudflare-presigner";

// Create app with both Cloudflare bindings and our adapter variables
const app = new Hono<{ Bindings: Env; Variables: GatewayEnv }>();

// Inject adapters into context from Cloudflare bindings
app.use("*", async (c, next) => {
  c.set("kv", new CloudflareKVAdapter(c.env.KV));
  c.set("r2", new CloudflareR2Adapter(c.env.R2));
  c.set("r2Public", new CloudflareR2Adapter(c.env.R2_PUBLIC));

  // Create presigner if credentials are configured
  if (c.env.R2_ACCOUNT_ID && c.env.R2_ACCESS_KEY_ID && c.env.R2_SECRET_ACCESS_KEY) {
    c.set("presigner", new CloudflarePresigner({
      accountId: c.env.R2_ACCOUNT_ID,
      accessKeyId: c.env.R2_ACCESS_KEY_ID,
      secretAccessKey: c.env.R2_SECRET_ACCESS_KEY,
    }));
  }

  c.set("config", {
    bootstrapApiKey: c.env.BOOTSTRAP_API_KEY,
    corsOrigin: c.env.CORS_ORIGIN,
    publicDomain: c.env.PUBLIC_DOMAIN,
    privateBucket: c.env.R2_PRIVATE_BUCKET || "federise-private",
    publicBucket: c.env.R2_PUBLIC_BUCKET || "federise-public",
  });

  return next();
});

// CORS middleware
app.use("*", (c, next) => {
  const origin = c.get("config").corsOrigin || "*";
  return cors({
    origin,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Blob-Namespace", "X-Blob-Key", "X-Blob-Public"],
    exposeHeaders: ["Content-Length", "Content-Disposition"],
    maxAge: 86400,
    credentials: false,
  })(c, next);
});

// Private Network Access (PNA) support for local network requests
app.use("*", async (c, next) => {
  const isPNARequest = c.req.header("Access-Control-Request-Private-Network") === "true";
  await next();
  if (isPNARequest) {
    c.res.headers.set("Access-Control-Allow-Private-Network", "true");
  }
});

// Register blob download route BEFORE auth middleware (uses URL-based auth via obscurity)
registerBlobDownloadRoute(app);

// Auth middleware
app.use("*", createAuthMiddleware());

// Register all gateway routes
registerGatewayRoutes(app);

export default app;

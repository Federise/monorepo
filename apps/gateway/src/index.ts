import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  createAuthMiddleware,
  registerGatewayRoutes,
  registerBlobDownloadRoute,
  registerPublicBlobRoute,
  registerTokenLogRoutes,
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
  c.set("blob", new CloudflareR2Adapter(c.env.R2));

  // Create presigner if credentials are configured
  if (c.env.R2_ACCOUNT_ID && c.env.R2_ACCESS_KEY_ID && c.env.R2_SECRET_ACCESS_KEY) {
    c.set("presigner", new CloudflarePresigner({
      accountId: c.env.R2_ACCOUNT_ID,
      accessKeyId: c.env.R2_ACCESS_KEY_ID,
      secretAccessKey: c.env.R2_SECRET_ACCESS_KEY,
      customDomain: c.env.R2_CUSTOM_DOMAIN,
    }));
  }

  c.set("config", {
    bootstrapApiKey: c.env.BOOTSTRAP_API_KEY,
    corsOrigin: c.env.CORS_ORIGIN,
    signingSecret: c.env.SIGNING_SECRET,
    bucket: c.env.R2_BUCKET || "federise-objects",
    presignExpiresIn: c.env.PRESIGN_EXPIRES_IN ? parseInt(c.env.PRESIGN_EXPIRES_IN, 10) : 3600,
  });

  return next();
});

// CORS middleware
app.use("*", (c, next) => {
  const origin = c.get("config").corsOrigin || "*";
  return cors({
    origin,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Blob-Namespace", "X-Blob-Key", "X-Blob-Public", "X-Blob-Visibility", "X-Log-Token"],
    exposeHeaders: ["Content-Length", "Content-Disposition"],
    maxAge: 86400,
    credentials: false,
  })(c, next);
});

// Handle all OPTIONS preflight requests (CORS middleware sets headers, this returns 204)
app.options("*", (c) => c.body(null, 204));

// Private Network Access (PNA) support for local network requests
app.use("*", async (c, next) => {
  const isPNARequest = c.req.header("Access-Control-Request-Private-Network") === "true";
  await next();
  if (isPNARequest) {
    c.res.headers.set("Access-Control-Allow-Private-Network", "true");
  }
});

// Register public blob route BEFORE auth middleware (handles public/presigned access)
registerPublicBlobRoute(app);

// Register authenticated blob download route BEFORE auth middleware
registerBlobDownloadRoute(app);

// Register token-based log routes BEFORE auth middleware (handles recipient access via token)
registerTokenLogRoutes(app);

// Auth middleware
app.use("*", createAuthMiddleware());

// Register all gateway routes
registerGatewayRoutes(app);

export default app;

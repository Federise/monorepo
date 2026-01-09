import { Hono } from "hono";
import { cors } from "hono/cors";

import {
  createAuthMiddleware,
  registerGatewayRoutes,
  registerBlobDownloadRoute,
  type GatewayEnv,
} from "@federise/gateway-core";
import { loadConfig } from "./env.ts";

// Adapters
import { DenoKVStore } from "./adapters/deno-kv.ts";
import { S3BlobStore } from "./adapters/s3-blob.ts";
import { S3Presigner } from "./adapters/s3-presigner.ts";

// Self-hosted only endpoint
import { AdminCheckEndpoint } from "./endpoints/admin/check.ts";

// Load configuration
const config = loadConfig();

// Initialize adapters
const kvStore = new DenoKVStore(config.kvPath);

const s3Config = {
  endpoint: config.s3Endpoint,
  accessKeyId: config.s3AccessKeyId,
  secretAccessKey: config.s3SecretAccessKey,
  region: config.s3Region,
};

const privateBlobStore = new S3BlobStore({
  ...s3Config,
  bucket: config.s3PrivateBucket,
});

const publicBlobStore = new S3BlobStore({
  ...s3Config,
  bucket: config.s3PublicBucket,
});

const presigner = new S3Presigner(s3Config);

// Create Hono app
const app = new Hono<{ Variables: GatewayEnv }>();

// Inject adapters into context
app.use("*", async (c, next) => {
  c.set("kv", kvStore);
  c.set("r2", privateBlobStore);
  c.set("r2Public", publicBlobStore);
  c.set("presigner", presigner);
  c.set("config", {
    bootstrapApiKey: config.bootstrapApiKey,
    corsOrigin: config.corsOrigin,
    publicDomain: config.publicDomain,
    privateBucket: config.s3PrivateBucket,
    publicBucket: config.s3PublicBucket,
  });
  return next();
});

// CORS middleware
app.use("*", (c, next) => {
  return cors({
    origin: config.corsOrigin,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Blob-Namespace", "X-Blob-Key", "X-Blob-Public"],
    exposeHeaders: ["Content-Length", "Content-Disposition"],
    maxAge: 86400,
    credentials: false,
  })(c, next);
});

// Register blob download route BEFORE auth middleware (uses URL-based auth via obscurity)
registerBlobDownloadRoute(app);

// Auth middleware (with admin endpoint support for self-hosted)
app.use("*", createAuthMiddleware({ allowBootstrapAdmin: true }));

// Register all shared gateway routes
const openapi = registerGatewayRoutes(app);

// Self-hosted only: admin check endpoint
openapi.post("/admin/check", AdminCheckEndpoint);

// Start server using Deno.serve
console.log(`Starting Federise Gateway (Deno self-hosted) on port ${config.port}...`);

Deno.serve({
  port: config.port,
  onListen({ port }) {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`OpenAPI docs available at http://localhost:${port}/openapi`);
  },
}, app.fetch);

import { Hono } from "hono";

import {
  createAuthMiddleware,
  registerGatewayRoutes,
  registerBlobDownloadRoute,
  type GatewayEnv,
  type IBlobStore,
  type IPresigner,
} from "@federise/gateway-core";
import { loadConfig } from "./env.ts";

// Adapters
import { DenoKVStore } from "./adapters/deno-kv.ts";
import { S3BlobStore } from "./adapters/s3-blob.ts";
import { S3Presigner } from "./adapters/s3-presigner.ts";
import { FilesystemBlobStore } from "./adapters/filesystem-blob.ts";
import { FilesystemPresigner } from "./adapters/filesystem-presigner.ts";

// Self-hosted only endpoints
import { AdminCheckEndpoint } from "./endpoints/admin/check.ts";
import { registerPresignedRoutes } from "./endpoints/blob/presigned-routes.ts";

// Load configuration
const config = loadConfig();

// Initialize adapters
const kvStore = new DenoKVStore(config.kvPath);

// Initialize blob storage based on mode
let privateBlobStore: IBlobStore;
let publicBlobStore: IBlobStore;
let presigner: IPresigner | undefined;
let signingSecret: string | undefined;

// Default base URL for presigning (can be overridden by PRESIGN_BASE_URL)
const defaultBaseUrl = `http://localhost:${config.port}`;

if (config.blobStorageMode === "filesystem") {
  console.log(`Blob storage: filesystem (${config.blobPath})`);

  privateBlobStore = new FilesystemBlobStore({
    basePath: `${config.blobPath}/private`,
  });

  publicBlobStore = new FilesystemBlobStore({
    basePath: `${config.blobPath}/public`,
  });

  // Use bootstrap API key as signing secret for presigned URLs
  signingSecret = config.bootstrapApiKey;
  const baseUrl = config.presignBaseUrl || defaultBaseUrl;

  presigner = new FilesystemPresigner({
    baseUrl,
    signingSecret,
  });

  console.log(`Presigned URLs: enabled (base: ${baseUrl})`);
} else {
  console.log(`Blob storage: S3 (${config.s3Endpoint})`);

  const s3Config = {
    endpoint: config.s3Endpoint!,
    accessKeyId: config.s3AccessKeyId!,
    secretAccessKey: config.s3SecretAccessKey!,
    region: config.s3Region,
  };

  privateBlobStore = new S3BlobStore({
    ...s3Config,
    bucket: config.s3PrivateBucket,
  });

  publicBlobStore = new S3BlobStore({
    ...s3Config,
    bucket: config.s3PublicBucket,
  });

  presigner = new S3Presigner(s3Config);
}

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

// CORS middleware with Private Network Access support
app.use("*", async (c, next) => {
  const isPNARequest = c.req.header("Access-Control-Request-Private-Network") === "true";

  // Standard CORS headers
  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": config.corsOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Blob-Namespace, X-Blob-Key, X-Blob-Public",
    "Access-Control-Expose-Headers": "Content-Length, Content-Disposition, Access-Control-Allow-Origin",
    "Access-Control-Max-Age": "86400",
  };

  // Add PNA header if requested
  if (isPNARequest) {
    corsHeaders["Access-Control-Allow-Private-Network"] = "true";
  }

  // Handle OPTIONS preflight requests
  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // For non-OPTIONS requests, add CORS headers to response
  await next();

  // Add CORS headers to the response
  for (const [key, value] of Object.entries(corsHeaders)) {
    c.res.headers.set(key, value);
  }
});

// Register blob download route BEFORE auth middleware (uses URL-based auth via obscurity)
registerBlobDownloadRoute(app);

// Register presigned routes BEFORE auth middleware (filesystem mode only)
// These routes use token-based auth instead of API key auth
if (config.blobStorageMode === "filesystem" && signingSecret) {
  registerPresignedRoutes(app, signingSecret);
}

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

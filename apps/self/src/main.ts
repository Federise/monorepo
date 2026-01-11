import { Hono } from "hono";
import { cors } from "hono/cors";
import { load as loadEnv } from "jsr:@std/dotenv";

import {
  createAuthMiddleware,
  registerGatewayRoutes,
  registerBlobDownloadRoute,
  registerPublicBlobRoute,
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

// Load .env file if it exists (for compiled binary support)
await loadEnv({ export: true });

// Load configuration
const config = loadConfig();

/**
 * Get or create a persistent signing secret for presigned URLs.
 */
async function getOrCreateSigningSecret(dataDir: string): Promise<string> {
  const secretPath = `${dataDir}/signing-secret`;

  try {
    return await Deno.readTextFile(secretPath);
  } catch {
    const secret = crypto.randomUUID() + crypto.randomUUID();
    await Deno.mkdir(dataDir, { recursive: true });
    await Deno.writeTextFile(secretPath, secret);
    return secret;
  }
}

// Initialize adapters
const kvStore = new DenoKVStore(config.kvPath);

// Pre-provision __ORG:permissions if it doesn't exist
const existingPermissions = await kvStore.get("__ORG:permissions");
if (!existingPermissions) {
  await kvStore.put("__ORG:permissions", "{}");
  console.log("Initialized empty permissions table");
}

// Initialize blob storage based on mode
let blobStore: IBlobStore;
let presigner: IPresigner | undefined;

// Get or generate signing secret
const signingSecret = config.signingSecret || await getOrCreateSigningSecret(config.dataDir);

// Default base URL for presigned URLs
const defaultBaseUrl = config.presignBaseUrl || `http://localhost:${config.port}`;

if (config.blobStorageMode === "filesystem") {
  console.log(`Blob storage: filesystem (${config.blobPath})`);

  blobStore = new FilesystemBlobStore({
    basePath: config.blobPath!,
  });

  presigner = new FilesystemPresigner({
    baseUrl: defaultBaseUrl,
    signingSecret,
  });

  console.log(`Presigned URLs: enabled (base: ${defaultBaseUrl})`);
} else {
  console.log(`Blob storage: S3 (${config.s3Endpoint})`);

  const s3Config = {
    endpoint: config.s3Endpoint!,
    accessKeyId: config.s3AccessKeyId!,
    secretAccessKey: config.s3SecretAccessKey!,
    region: config.s3Region,
  };

  blobStore = new S3BlobStore({
    ...s3Config,
    bucket: config.s3Bucket,
  });

  presigner = new S3Presigner(s3Config);
}

// Create Hono app
const app = new Hono<{ Variables: GatewayEnv }>();

// Inject adapters into context
app.use("*", async (c, next) => {
  c.set("kv", kvStore);
  c.set("blob", blobStore);
  c.set("presigner", presigner);
  c.set("config", {
    bootstrapApiKey: config.bootstrapApiKey,
    corsOrigin: config.corsOrigin,
    signingSecret,
    bucket: config.s3Bucket,
    presignExpiresIn: config.presignExpiresIn,
  });
  return next();
});

// CORS middleware
app.use("*", cors({
  origin: config.corsOrigin,
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-Blob-Namespace", "X-Blob-Key", "X-Blob-Public", "X-Blob-Visibility"],
  exposeHeaders: ["Content-Length", "Content-Disposition"],
  maxAge: 86400,
}));

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

// Register blob download route BEFORE auth middleware (authenticated download)
registerBlobDownloadRoute(app);

// Register presigned routes BEFORE auth middleware (filesystem mode only - for uploads)
if (config.blobStorageMode === "filesystem") {
  registerPresignedRoutes(app, signingSecret);
}

// Auth middleware
app.use("*", createAuthMiddleware({ allowBootstrapAdmin: true }));

// Register all shared gateway routes
const openapi = registerGatewayRoutes(app);

// Self-hosted only: admin check endpoint
openapi.post("/admin/check", AdminCheckEndpoint);

// Start server
console.log(`Starting Federise Gateway on port ${config.port}...`);

if (config.bootstrapApiKey) {
  console.log(`Bootstrap API key: ${config.bootstrapApiKey}`);
  const principals = await kvStore.list({ prefix: "__PRINCIPAL:" });
  if (principals.keys.length > 0) {
    console.log(`Bootstrap API key will not be used - principals already exist`);
  }
} else {
  console.log(`Bootstrap API key: not set`);
}

Deno.serve({
  port: config.port,
  onListen({ port }) {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`OpenAPI docs available at http://localhost:${port}/openapi`);
  },
}, app.fetch);

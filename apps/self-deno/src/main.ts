import { Hono } from "hono";
import { cors } from "hono/cors";
import { load as loadEnv } from "jsr:@std/dotenv";

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

// Load .env file if it exists (for compiled binary support)
await loadEnv({ export: true });

// Load configuration
const config = loadConfig();

/**
 * Get or create a persistent signing secret for presigned URLs.
 * This is used in open mode when no bootstrap API key is configured.
 */
async function getOrCreateSigningSecret(dataDir: string): Promise<string> {
  const secretPath = `${dataDir}/signing-secret`;

  try {
    return await Deno.readTextFile(secretPath);
  } catch {
    // Generate a new secret
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
let privateBlobStore: IBlobStore;
let publicBlobStore: IBlobStore;
let presigner: IPresigner | undefined;
let signingSecret: string | undefined;

// Determine if TLS is enabled
const useTls = config.tlsMode !== "off";
const protocol = useTls ? "https" : "http";

// Default base URL for presigning (can be overridden by PRESIGN_BASE_URL)
// Use domain if available (for ACME mode), otherwise localhost
const defaultHost = config.domain || "localhost";
const isDefaultPort = (protocol === "https" && config.port === 443) || (protocol === "http" && config.port === 80);
const defaultBaseUrl = `${protocol}://${defaultHost}${isDefaultPort ? "" : ":" + config.port}`;

if (config.blobStorageMode === "filesystem") {
  console.log(`Blob storage: filesystem (${config.blobPath})`);

  privateBlobStore = new FilesystemBlobStore({
    basePath: `${config.blobPath}/private`,
  });

  publicBlobStore = new FilesystemBlobStore({
    basePath: `${config.blobPath}/public`,
  });

  // Use bootstrap API key as signing secret, or generate one for open mode
  signingSecret = config.bootstrapApiKey || await getOrCreateSigningSecret(config.dataDir);
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

// CORS middleware using Hono's built-in cors
app.use("*", cors({
  origin: config.corsOrigin,
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-Blob-Namespace", "X-Blob-Key", "X-Blob-Public"],
  exposeHeaders: ["Content-Length", "Content-Disposition"],
  maxAge: 86400,
}));

// Private Network Access (PNA) support for local network requests
app.use("*", async (c, next) => {
  const isPNARequest = c.req.header("Access-Control-Request-Private-Network") === "true";

  await next();

  // Add PNA header if this is a preflight request for private network access
  if (isPNARequest) {
    c.res.headers.set("Access-Control-Allow-Private-Network", "true");
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

// Start server
await startServer();

async function startServer() {
  await dumpKv();

  // Determine TLS configuration based on mode
  let tlsConfig: { cert: string; key: string } | null = null;
  let challengeServer: Deno.HttpServer | undefined;

  console.log(`TLS mode: ${config.tlsMode}`);

  switch (config.tlsMode) {
    case "off":
      console.log("Running without TLS (HTTP only)");
      break;

    case "auto": {
      // Auto-generate self-signed certificates
      const { ensureTlsCerts } = await import("./lib/tls.ts");
      tlsConfig = await ensureTlsCerts(config.dataDir);
      break;
    }

    case "acme": {
      // Use Let's Encrypt
      const { ensureAcmeCertificate, startChallengeServer } = await import("./lib/acme.ts");

      // Start HTTP challenge server on port 80
      challengeServer = startChallengeServer(config.port);

      try {
        tlsConfig = await ensureAcmeCertificate({
          domain: config.domain!,
          email: config.acmeEmail,
          dataDir: config.dataDir,
          staging: config.acmeStaging,
        });
      } catch (err) {
        console.error("Failed to obtain Let's Encrypt certificate:", err);
        console.error("Falling back to self-signed certificate...");
        const { ensureTlsCerts } = await import("./lib/tls.ts");
        tlsConfig = await ensureTlsCerts(config.dataDir);
      }
      break;
    }

    case "custom": {
      // Use provided certificate files
      console.log(`Using TLS certificates from ${config.tlsCert}`);
      tlsConfig = {
        cert: Deno.readTextFileSync(config.tlsCert!),
        key: Deno.readTextFileSync(config.tlsKey!),
      };
      break;
    }
  }

  const protocol = tlsConfig ? "https" : "http";
  const host = config.domain || "localhost";

  console.log(`Starting Federise Gateway (Deno self-hosted) on port ${config.port}...`);

  if (config.bootstrapApiKey) {
    console.log(`Bootstrap API key: ${config.bootstrapApiKey}`);
    const principals = await kvStore.list({ prefix: "__PRINCIPAL:" });
    if (principals.keys.length > 0) {
      console.log(`Bootstrap API will not be used - principals already exist`);
    }
  } else {
    console.log(`Bootstrap API key: not set`);
  }

  Deno.serve({
    port: config.port,
    ...(tlsConfig && {
      cert: tlsConfig.cert,
      key: tlsConfig.key,
    }),
    onListen({ port }) {
      const portSuffix = (protocol === "https" && port === 443) || (protocol === "http" && port === 80) ? "" : `:${port}`;
      console.log(`Server running at ${protocol}://${host}${portSuffix}`);
      console.log(`OpenAPI docs available at ${protocol}://${host}${portSuffix}/openapi`);

      if (config.tlsMode === "auto") {
        console.log("");
        console.log("=".repeat(60));
        console.log("HTTPS with self-signed certificate");
        console.log("=".repeat(60));
        console.log("Browsers will show a security warning for self-signed certs.");
        console.log("To use the API from a browser app:");
        console.log("");
        console.log(`  1. Visit ${protocol}://${host}${portSuffix} in your browser`);
        console.log("  2. Accept the security warning:");
        console.log("     - Chrome: Click 'Advanced' > 'Proceed to localhost'");
        console.log("     - Firefox: Click 'Advanced' > 'Accept the Risk and Continue'");
        console.log("     - Safari: Click 'Show Details' > 'visit this website'");
        console.log("");
        console.log("After accepting, the certificate will be trusted for this session.");
        console.log("=".repeat(60));
      } else if (config.tlsMode === "acme") {
        console.log("");
        console.log("=".repeat(60));
        console.log("HTTPS with Let's Encrypt certificate");
        console.log("=".repeat(60));
        console.log(`Certificate issued for: ${config.domain}`);
        console.log("Certificate will auto-renew when it expires.");
        if (challengeServer) {
          console.log("HTTP challenge server running on port 80 (redirects to HTTPS)");
        }
        console.log("=".repeat(60));
      }
    },
  }, app.fetch);
}

async function dumpKv() {
  const kvPath = Deno.env.get("KV_PATH") || undefined;
  const kv = await Deno.openKv(kvPath);

  console.log("KV Database Contents:");
  console.log("=".repeat(60));

  let count = 0;
  for await (const entry of kv.list({ prefix: [] })) {
    count++;
    console.log(`\nKey: ${JSON.stringify(entry.key)}`);
    console.log(`Value: ${JSON.stringify(entry.value, null, 2)}`);
  }

  if (count === 0) {
    console.log("\n(empty - no entries found)");
  } else {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Total entries: ${count}`);
  }

  kv.close();

}
export type BlobStorageMode = "filesystem" | "s3";
export type TlsMode = "off" | "auto" | "acme" | "custom";

export interface GatewayConfig {
  // Server
  port: number;
  corsOrigin: string;

  // TLS mode:
  // - "off": No TLS (HTTP only)
  // - "auto": Auto-generate self-signed certs (for development)
  // - "acme": Use Let's Encrypt (requires DOMAIN to be set)
  // - "custom": Use provided TLS_CERT and TLS_KEY paths
  tlsMode: TlsMode;
  tlsCert?: string; // Path to certificate file (PEM) - for custom mode
  tlsKey?: string; // Path to private key file (PEM) - for custom mode

  // Let's Encrypt / ACME configuration
  domain?: string; // Domain for Let's Encrypt certificate
  acmeEmail?: string; // Contact email for Let's Encrypt
  acmeStaging?: boolean; // Use Let's Encrypt staging environment

  // Data directory for generated certs, KV, etc.
  dataDir: string;

  // Authentication (optional - if not set, gateway runs in open mode)
  bootstrapApiKey?: string;

  // Deno KV (KV storage)
  kvPath?: string;

  // Blob storage mode
  blobStorageMode: BlobStorageMode;

  // Filesystem blob storage (when blobStorageMode === "filesystem")
  blobPath?: string;

  // Base URL for presigned URLs (filesystem mode)
  // If not set, will be constructed from request URL
  presignBaseUrl?: string;

  // S3/MinIO blob storage (when blobStorageMode === "s3")
  s3Endpoint?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  s3Region: string;
  s3PrivateBucket: string;
  s3PublicBucket: string;

  // Optional: Public URL for blob downloads
  publicDomain?: string;
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): GatewayConfig {
  // Determine blob storage mode
  const explicitMode = Deno.env.get("BLOB_STORAGE") as BlobStorageMode | undefined;
  const hasS3Config = Deno.env.get("S3_ENDPOINT") && Deno.env.get("S3_ACCESS_KEY_ID");

  // Default to filesystem if no S3 config, otherwise s3
  const blobStorageMode: BlobStorageMode = explicitMode || (hasS3Config ? "s3" : "filesystem");

  // Determine TLS mode
  const tlsModeEnv = Deno.env.get("TLS_MODE");
  const tlsAuto = Deno.env.get("TLS_AUTO") === "true";
  const domain = Deno.env.get("DOMAIN");
  const tlsCert = Deno.env.get("TLS_CERT");
  const tlsKey = Deno.env.get("TLS_KEY");

  let tlsMode: TlsMode;
  if (tlsModeEnv) {
    tlsMode = tlsModeEnv as TlsMode;
  } else if (domain) {
    // If domain is set, default to ACME
    tlsMode = "acme";
  } else if (tlsCert && tlsKey) {
    // If cert and key paths are provided, use custom
    tlsMode = "custom";
  } else if (tlsAuto) {
    // Legacy TLS_AUTO support
    tlsMode = "auto";
  } else {
    // Default to off
    tlsMode = "off";
  }

  // Determine default port based on TLS mode
  const portEnv = Deno.env.get("PORT");
  let defaultPort: number;
  if (tlsMode === "acme" || tlsMode === "custom") {
    defaultPort = 443;
  } else if (tlsMode === "auto") {
    defaultPort = 3000; // Development with self-signed
  } else {
    defaultPort = 3000; // HTTP mode
  }

  const config: GatewayConfig = {
    // Server
    port: portEnv ? parseInt(portEnv, 10) : defaultPort,
    corsOrigin: Deno.env.get("CORS_ORIGIN") || "*",

    // Data directory
    dataDir: Deno.env.get("DATA_DIR") || "./data",

    // TLS
    tlsMode,
    tlsCert,
    tlsKey,

    // ACME / Let's Encrypt
    domain,
    acmeEmail: Deno.env.get("ACME_EMAIL"),
    acmeStaging: Deno.env.get("ACME_STAGING") === "true",

    // Authentication (optional)
    bootstrapApiKey: Deno.env.get("BOOTSTRAP_API_KEY"),

    // Deno KV (optional path, defaults to Deno's default location)
    kvPath: Deno.env.get("KV_PATH") || undefined,

    // Blob storage
    blobStorageMode,
    blobPath: Deno.env.get("BLOB_PATH") || "./data/blobs",
    presignBaseUrl: Deno.env.get("PRESIGN_BASE_URL"),

    // S3/MinIO (optional in filesystem mode)
    s3Endpoint: Deno.env.get("S3_ENDPOINT"),
    s3AccessKeyId: Deno.env.get("S3_ACCESS_KEY_ID"),
    s3SecretAccessKey: Deno.env.get("S3_SECRET_ACCESS_KEY"),
    s3Region: Deno.env.get("S3_REGION") || "us-east-1",
    s3PrivateBucket: Deno.env.get("S3_PRIVATE_BUCKET") || "federise-private",
    s3PublicBucket: Deno.env.get("S3_PUBLIC_BUCKET") || "federise-public",

    // Optional
    publicDomain: Deno.env.get("PUBLIC_DOMAIN"),
  };

  // Validate S3 config if in S3 mode
  if (blobStorageMode === "s3") {
    if (!config.s3Endpoint) {
      throw new Error("S3_ENDPOINT is required when BLOB_STORAGE=s3");
    }
    if (!config.s3AccessKeyId) {
      throw new Error("S3_ACCESS_KEY_ID is required when BLOB_STORAGE=s3");
    }
    if (!config.s3SecretAccessKey) {
      throw new Error("S3_SECRET_ACCESS_KEY is required when BLOB_STORAGE=s3");
    }
  }

  // Validate TLS config
  if (tlsMode === "acme" && !config.domain) {
    throw new Error("DOMAIN is required when TLS_MODE=acme");
  }
  if (tlsMode === "custom") {
    if (!config.tlsCert) {
      throw new Error("TLS_CERT is required when TLS_MODE=custom");
    }
    if (!config.tlsKey) {
      throw new Error("TLS_KEY is required when TLS_MODE=custom");
    }
  }

  return config;
}

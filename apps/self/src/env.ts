export type BlobStorageMode = "filesystem" | "s3";

export interface GatewayConfig {
  // Server
  port: number;
  corsOrigin: string;

  // Data directory for KV, blobs, etc.
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
  presignBaseUrl?: string;

  // S3/MinIO blob storage (when blobStorageMode === "s3")
  s3Endpoint?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  s3Region: string;
  s3Bucket: string;

  // Signing secret for HMAC presigned download URLs
  signingSecret?: string;

  // Presigned URL expiration (seconds)
  presignExpiresIn: number;
}

export function loadConfig(): GatewayConfig {
  // Determine blob storage mode
  const explicitMode = Deno.env.get("BLOB_STORAGE") as BlobStorageMode | undefined;
  const hasS3Config = Deno.env.get("S3_ENDPOINT") && Deno.env.get("S3_ACCESS_KEY_ID");

  // Default to filesystem if no S3 config, otherwise s3
  const blobStorageMode: BlobStorageMode = explicitMode || (hasS3Config ? "s3" : "filesystem");

  const config: GatewayConfig = {
    // Server
    port: parseInt(Deno.env.get("PORT") || "3000", 10),
    corsOrigin: Deno.env.get("CORS_ORIGIN") || "*",

    // Data directory
    dataDir: Deno.env.get("DATA_DIR") || "./data",

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
    s3Bucket: Deno.env.get("S3_BUCKET") || "federise-objects",

    // Signing secret (optional - auto-generated if not set)
    signingSecret: Deno.env.get("SIGNING_SECRET"),

    // Presigned URL expiration
    presignExpiresIn: parseInt(Deno.env.get("PRESIGN_EXPIRES_IN") || "3600", 10),
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

  return config;
}

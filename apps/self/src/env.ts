import "dotenv/config";

export interface GatewayConfig {
  // Server
  port: number;
  corsOrigin: string;

  // Authentication
  bootstrapApiKey: string;

  // SQLite (KV storage)
  sqlitePath: string;

  // S3/MinIO (Blob storage)
  s3Endpoint: string;
  s3AccessKeyId: string;
  s3SecretAccessKey: string;
  s3Region: string;
  s3PrivateBucket: string;
  s3PublicBucket: string;

  // Optional: Public URL for blob downloads
  publicDomain?: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): GatewayConfig {
  return {
    // Server
    port: parseInt(process.env.PORT || "3000", 10),
    corsOrigin: process.env.CORS_ORIGIN || "*",

    // Authentication
    bootstrapApiKey: requireEnv("BOOTSTRAP_API_KEY"),

    // SQLite
    sqlitePath: process.env.SQLITE_PATH || "./data/kv.db",

    // S3/MinIO
    s3Endpoint: requireEnv("S3_ENDPOINT"),
    s3AccessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
    s3SecretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
    s3Region: process.env.S3_REGION || "us-east-1",
    s3PrivateBucket: process.env.S3_PRIVATE_BUCKET || "federise-private",
    s3PublicBucket: process.env.S3_PUBLIC_BUCKET || "federise-public",

    // Optional
    publicDomain: process.env.PUBLIC_DOMAIN,
  };
}

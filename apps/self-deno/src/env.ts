export interface GatewayConfig {
  // Server
  port: number;
  corsOrigin: string;

  // Authentication
  bootstrapApiKey: string;

  // Deno KV (KV storage)
  kvPath?: string;

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
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): GatewayConfig {
  return {
    // Server
    port: parseInt(Deno.env.get("PORT") || "3000", 10),
    corsOrigin: Deno.env.get("CORS_ORIGIN") || "*",

    // Authentication
    bootstrapApiKey: requireEnv("BOOTSTRAP_API_KEY"),

    // Deno KV (optional path, defaults to Deno's default location)
    kvPath: Deno.env.get("KV_PATH") || undefined,

    // S3/MinIO
    s3Endpoint: requireEnv("S3_ENDPOINT"),
    s3AccessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
    s3SecretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
    s3Region: Deno.env.get("S3_REGION") || "us-east-1",
    s3PrivateBucket: Deno.env.get("S3_PRIVATE_BUCKET") || "federise-private",
    s3PublicBucket: Deno.env.get("S3_PUBLIC_BUCKET") || "federise-public",

    // Optional
    publicDomain: Deno.env.get("PUBLIC_DOMAIN"),
  };
}
